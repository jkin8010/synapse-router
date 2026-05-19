// Platform detection and install path resolution

import { existsSync } from "node:fs";
import { join } from "node:path";

/** Supported AI Agent platforms */
export type Platform = "claude-code" | "cursor" | "codex" | "openclaw" | "hermes";

/** Valid platform string literals for runtime validation */
export const VALID_PLATFORMS: Platform[] = ["claude-code", "cursor", "codex", "openclaw", "hermes"];

/** Install info for a resolved platform */
export interface InstallInfo {
  /** Absolute target path (directory for claude-code, file for others) */
  targetPath: string;
  /** Package-relative source file path */
  sourceFile: string;
  /** Final filename at target (e.g., "SKILL.md" for claude-code) */
  targetName: string;
  /** true for directory-type targets (claude-code), false for file targets */
  isDirectoryTarget: boolean;
}

/** Platform detectors in priority order (first match wins, stops early) */
const DETECTORS: Array<{ platform: Platform; check: (cwd: string, home: string) => boolean }> = [
  { platform: "claude-code", check: (cwd) => existsSync(join(cwd, ".claude")) || existsSync(join(cwd, "CLAUDE.md")) },
  { platform: "cursor", check: (cwd) => existsSync(join(cwd, ".cursor")) || existsSync(join(cwd, ".cursorrules")) },
  { platform: "codex", check: (_, home) => existsSync(join(home, ".codex")) },
  { platform: "openclaw", check: (_, home) => existsSync(join(home, ".openclaw")) },
  { platform: "hermes", check: (_, home) => existsSync(join(home, ".hermes")) },
];

/** Install paths per platform (resolved from cwd or home) */
const INSTALL_PATHS: Record<Platform, (cwd: string, home: string) => string> = {
  "claude-code": (cwd) => join(cwd, ".claude", "skills", "synapse-router"),
  "cursor":      (cwd) => join(cwd, ".cursor", "rules", "synapse-router.mdc"),
  "codex":       (_, home) => join(home, ".codex", "agents", "synapse-router.yaml"),
  "openclaw":    (_, home) => join(home, ".openclaw", "agents", "synapse-router.md"),
  "hermes":      (_, home) => join(home, ".hermes", "agents", "synapse-router.md"),
};

/** Source file paths relative to skills/ directory */
const SOURCE_FILES: Record<Platform, string> = {
  "claude-code": "claude-code/skill.md",
  "cursor":      "cursor/.cursorrules",
  "codex":       "codex/agent.yaml",
  "openclaw":    "openclaw/agent.md",
  "hermes":      "hermes/agent.md",
};

/** Target filenames per platform */
const TARGET_NAMES: Record<Platform, string> = {
  "claude-code": "SKILL.md",
  "cursor":      "synapse-router.mdc",
  "codex":       "synapse-router.yaml",
  "openclaw":    "synapse-router.md",
  "hermes":      "synapse-router.md",
};

/**
 * Detect AI Agent platform from CWD and home directory.
 * Returns first matching platform in priority order, or null if none found.
 *
 * Priority: claude-code > cursor > codex > openclaw > hermes
 */
export function detectPlatform(cwd: string, home: string): Platform | null {
  for (const { platform, check } of DETECTORS) {
    if (check(cwd, home)) return platform;
  }
  return null;
}

/**
 * Resolve install info for a given platform.
 *
 * @param platform - Target platform
 * @param cwd - Current working directory
 * @param home - User home directory
 * @param customDir - Optional override for target path
 * @returns InstallInfo with resolved paths
 */
export function resolveInstallInfo(platform: Platform, cwd: string, home: string, customDir?: string): InstallInfo {
  const isDirectoryTarget = platform === "claude-code";

  if (customDir !== undefined) {
    return {
      targetPath: customDir,
      sourceFile: SOURCE_FILES[platform],
      targetName: TARGET_NAMES[platform],
      isDirectoryTarget,
    };
  }

  return {
    targetPath: INSTALL_PATHS[platform](cwd, home),
    sourceFile: SOURCE_FILES[platform],
    targetName: TARGET_NAMES[platform],
    isDirectoryTarget,
  };
}
