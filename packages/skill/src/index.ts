// @synapse-router/skill — AI Agent Skill Package

/** Current skill content version. Bump when content changes. */
export const SKILL_VERSION = "0.1.0";

/** All supported AI Agent platforms. */
export const PLATFORMS = ["claude-code", "cursor", "codex", "openclaw", "hermes"] as const;

/** Union type of supported platforms. */
export type Platform = (typeof PLATFORMS)[number];

/** File basename for each platform's skill file. */
const PLATFORM_FILES: Record<Platform, string> = {
  "claude-code": "skill.md",
  cursor: ".cursorrules",
  codex: "agent.yaml",
  openclaw: "agent.md",
  hermes: "agent.md",
};

/**
 * Returns the package-relative path to a platform's skill configuration file.
 * Example: getSkillPath("claude-code") -> "skills/claude-code/skill.md"
 */
export function getSkillPath(platform: Platform): string {
  return `skills/${platform}/${PLATFORM_FILES[platform]}`;
}

/**
 * Returns just the filename for a platform's skill file.
 * Example: getPlatformFileName("codex") -> "agent.yaml"
 */
export function getPlatformFileName(platform: Platform): string {
  return PLATFORM_FILES[platform];
}
