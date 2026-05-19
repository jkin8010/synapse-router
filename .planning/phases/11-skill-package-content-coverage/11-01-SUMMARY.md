---
phase: 11-skill-package-content-coverage
plan: 01
subsystem: skill
tags: [npm-package, typescript, ai-agent, claude-code, cursor, codex, openclaw, hermes]

requires: []
provides:
  - "@synapse-router/skill npm package scaffold"
  - "TypeScript compiler configuration for skill package"
  - "Public API with version, platform constants, and path utilities"
  - "skills/ directory structure with 5 platform subdirectories"
affects: [11-02, 11-03, 11-04]

tech-stack:
  added: ["typescript ^5.9.0"]
  patterns: ["Package scaffold extending tsconfig.base.json", "Content-only package with skills/ directory in npm files"]

key-files:
  created:
    - packages/skill/package.json
    - packages/skill/tsconfig.json
    - packages/skill/src/index.ts
    - packages/skill/skills/claude-code/.gitkeep
    - packages/skill/skills/cursor/.gitkeep
    - packages/skill/skills/codex/.gitkeep
    - packages/skill/skills/openclaw/.gitkeep
    - packages/skill/skills/hermes/.gitkeep
  modified: []

key-decisions:
  - "Package is content-only with zero runtime dependencies (no 'dependencies' block)"
  - "'files' in package.json includes both 'dist/' and 'skills/' to bundle platform content on npm publish"
  - "composite: true is NOT set (skill is a leaf package, not referenced by other packages)"
  - "Platform file naming aligned with each platform's convention: skill.md for Claude Code, .cursorrules for Cursor, agent.yaml for Codex, agent.md for OpenClaw and Hermes"

patterns-established:
  - "New packages follow the billing package template: extends tsconfig.base.json, rootDir src, outDir dist"
  - "Content-only packages include the content directory in 'files' for npm distribution"

requirements-completed:
  - SKILLPKG-01
  - SKILLPKG-02

duration: 8min
completed: 2026-05-19
---

# Phase 11 Plan 01: Skill Package Scaffold Summary

**@synapse-router/skill npm package scaffold with TypeScript config, public API, and 5-platform skill directory structure**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-19T10:48:00Z
- **Completed:** 2026-05-19T10:56:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Created `packages/skill/package.json` with `@synapse-router/skill` scope, exports, and `skills/` in npm files
- Created `packages/skill/tsconfig.json` extending `tsconfig.base.json` with `rootDir: src`, `outDir: dist`
- Implemented `src/index.ts` public API exporting `SKILL_VERSION`, `PLATFORMS`, `Platform` type, `getSkillPath()`, and `getPlatformFileName()`
- Established 5 platform subdirectories under `skills/`: claude-code, cursor, codex, openclaw, hermes
- Installed dependencies and verified `tsc --noEmit` passes with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create package.json and tsconfig.json** - `9260205` (chore)
2. **Task 2: Create src/index.ts and skills/ directory structure** - `f4f06ec` (feat)

## Files Created/Modified

- `packages/skill/package.json` - @synapse-router/skill npm package manifest
- `packages/skill/tsconfig.json` - TypeScript compiler configuration
- `packages/skill/src/index.ts` - Public API entry point
- `packages/skill/skills/claude-code/.gitkeep` - Claude Code skill directory
- `packages/skill/skills/cursor/.gitkeep` - Cursor skill directory
- `packages/skill/skills/codex/.gitkeep` - Codex skill directory
- `packages/skill/skills/openclaw/.gitkeep` - OpenClaw skill directory
- `packages/skill/skills/hermes/.gitkeep` - Hermes skill directory

## Decisions Made

- Package is content-only with zero runtime dependencies; only TypeScript as devDependency
- `files` in package.json includes both `dist/` and `skills/` to bundle platform content on npm publish
- `composite: true` intentionally omitted since skill is a leaf package
- Platform file naming follows each platform's native convention: `skill.md`, `.cursorrules`, `agent.yaml`, `agent.md`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Package scaffold is complete. Ready for plans 11-02 (skill package requirements and content coverage analysis), 11-03, and 11-04 to populate the skills/ directory with actual platform-specific content.

---

*Phase: 11-skill-package-content-coverage*
*Completed: 2026-05-19*
