---
phase: 17-cli-infrastructure
plan: 01
subsystem: cli
tags: [cli, infrastructure, prompts, tty, dependencies]
provides: [tty-detection, prompt-wrappers]
affects: [setup.ts, connect.ts, billing.ts, evolve.ts]
metrics:
  duration: 5m
  completed: 2026-05-25
  tasks: 3
  files_created: 2
  commits: 3
---

# Phase 17 Plan 01: Interactive CLI Foundations

Install @inquirer/prompts and picocolors, create TTY detection and shared prompt wrappers for all interactive CLI commands.

## Commit History

| Commit | Description |
|--------|-------------|
| ee257bc | feat(cli-infra): Install @inquirer/prompts and picocolors dependencies |
| 8640e8c | feat(cli-infra): Create isInteractive() TTY detection function |
| a15ff31 | feat(cli-infra): Create TTY-aware @inquirer/prompts wrappers |

## Files Created

- `apps/cli/src/utils/tty.ts` -- `isInteractive(): boolean` checking stdin/stdout TTY, CI env vars, `--no-interactive` flag
- `apps/cli/src/utils/prompts.ts` -- Six exported prompt wrappers: `promptSelect`, `promptCheckbox`, `promptConfirm`, `promptInput`, `promptSearch`, `promptPassword`

## Files Modified

- `apps/cli/package.json` -- Added `@inquirer/prompts@^8.4` and `picocolors@^1.1`
- `pnpm-lock.yaml` -- Updated via pnpm install

## Task Results

### Task 1: Install dependencies
**Status:** Done
**Action:** Ran `pnpm add @inquirer/prompts@^8.4 picocolors@^1.1` in `apps/cli/`
**Verification:** Both dependencies confirmed in package.json; dynamic `import('@inquirer/prompts')` resolves and exports `select`, `checkbox`, `confirm`, `input`, `password`, `search` among others.

### Task 2: Create utils/tty.ts with isInteractive()
**Status:** Done
**Action:** Created `apps/cli/src/utils/tty.ts` with single named export `isInteractive()`
**Verification:** TypeScript compiles with zero errors; function checks `process.stdin.isTTY`, `process.stdout.isTTY`, 6 CI env vars (`CI`, `GITHUB_ACTIONS`, `GITLAB_CI`, `CODEBUILD_BUILD_ID`, `JENKINS_URL`, `TF_BUILD`), and `--no-interactive` flag.

### Task 3: Create utils/prompts.ts with @inquirer/prompts wrappers
**Status:** Done
**Action:** Created `apps/cli/src/utils/prompts.ts` with 6 exported async prompt functions
**Verification:** TypeScript compiles with zero errors; each function checks `isInteractive()` before prompting; lazy dynamic import of `@inquirer/prompts`; `--yes` flag returns defaults in non-interactive mode; `promptPassword` always throws in non-interactive mode.

## Key Design Decisions

- **Lazy imports:** `@inquirer/prompts` is dynamically imported only when an interactive prompt is needed. Non-interactive CLI runs never load the dependency.
- **TTY gate first:** All prompt functions check `isInteractive()` before importing. Non-interactive paths return defaults (with `--yes`) or throw actionable errors.
- **.js extension imports:** Uses `import { isInteractive } from "./tty.js"` per the project's ESM `NodeNext` module resolution.
- **promptPassword strictness:** Cannot accept `--yes` for passwords -- requires `--api-key` flag or vault configuration (security by design).
- **picocolors deferred:** Installed but not used in prompts.ts. Available for command files that need terminal color output.

## Success Criteria

- [x] @inquirer/prompts@^8.4 and picocolors@^1.1 installed
- [x] utils/tty.ts exports `isInteractive(): boolean` with full TTY/CI/detection
- [x] utils/prompts.ts exports all 6 prompt wrappers with TTY gate
- [x] Each prompt wrapper handles --yes flag for non-interactive defaults
- [x] TypeScript compilation succeeds with zero errors
- [x] No existing command files (index.ts, commands/*.ts) were modified

## Deviations from Plan

None -- plan executed exactly as written.

## Threat Flags

None -- no new network endpoints, auth paths, or schema changes introduced.
