---
phase: 19-command-simplification
plan: 03
subsystem: cli
tags: [cli, help-text, refactoring]
requires:
  - phase: 19-01
    provides: utils/help.ts shared help text module
  - phase: 19-02
    provides: command merging (profile/export/import into config), smoke/init deprecation, connect --smoke
provides:
  - All 15 command files delegate print*Help() to utils/help.ts
  - Single source of truth for all CLI help text
affects: [docs, future CLI changes]
tech-stack:
  added: []
  patterns:
    - All command files import HELP_* from ../utils/help.js for help text
    - print*Help() functions are one-liner delegations
key-files:
  created: []
  modified:
    - apps/cli/src/commands/setup.ts
    - apps/cli/src/commands/negotiate.ts
    - apps/cli/src/commands/connect.ts
    - apps/cli/src/commands/evolve.ts
    - apps/cli/src/commands/config.ts
    - apps/cli/src/commands/billing.ts
    - apps/cli/src/commands/pack.ts
    - apps/cli/src/commands/lock.ts
    - apps/cli/src/commands/sdk.ts
    - apps/cli/src/commands/route.ts
    - apps/cli/src/commands/smoke.ts
    - apps/cli/src/commands/watchdog.ts
    - apps/cli/src/commands/init.ts
    - apps/cli/src/commands/profile.ts
    - apps/cli/src/commands/export.ts
key-decisions:
  - "generate.ts skipped — no standalone printGenerateHelp() function exists"
  - "All help text centralized in utils/help.ts — future help text changes only need one file edit"
requirements-completed: [CMD-03]
duration: 3min
completed: 2026-05-25
---

# Phase 19 Plan 03: Help Text Centralization Summary

**Migrated all 15 CLI command files to import print*Help() text from utils/help.ts instead of inline console.log template literals**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-25T10:03:16Z
- **Completed:** 2026-05-25T10:05:42Z
- **Tasks:** 3 (2 migration + 1 build/test)
- **Files modified:** 15

## Accomplishments

- Removed ~590 lines of duplicated inline help text across 15 command files
- All command files now import HELP_* constants from `utils/help.ts`
- Each `print*Help()` function is a single `console.log(HELP_XXX)` delegation
- Single source of truth established per D-11 — future help text changes only need `utils/help.ts`
- Build succeeds, all 42 existing tests pass, help output is identical

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate core workflow and configuration command help** - `1518eb0` (feat)
2. **Task 2: Migrate advanced command help** - `40d6b3f` (feat)
3. **Task 3: Build, test, and verify full integration** - `66dd134` (fix: re-add import lines blocked by gate guards)

**Plan metadata:** (pending)

_Note: generate.ts was skipped per plan instructions — no standalone `printGenerateHelp()` function exists in that file._

## Files Modified

- `apps/cli/src/commands/setup.ts` - import HELP_SETUP
- `apps/cli/src/commands/negotiate.ts` - import HELP_NEGOTIATE
- `apps/cli/src/commands/connect.ts` - import HELP_CONNECT
- `apps/cli/src/commands/evolve.ts` - import HELP_EVOLVE
- `apps/cli/src/commands/config.ts` - import HELP_CONFIG
- `apps/cli/src/commands/billing.ts` - import HELP_BILLING
- `apps/cli/src/commands/pack.ts` - import HELP_PACK
- `apps/cli/src/commands/lock.ts` - import HELP_LOCK
- `apps/cli/src/commands/sdk.ts` - import HELP_SDK
- `apps/cli/src/commands/route.ts` - import HELP_ROUTE
- `apps/cli/src/commands/smoke.ts` - import HELP_SMOKE
- `apps/cli/src/commands/watchdog.ts` - import HELP_WATCHDOG
- `apps/cli/src/commands/init.ts` - import HELP_INIT
- `apps/cli/src/commands/profile.ts` - import HELP_PROFILE
- `apps/cli/src/commands/export.ts` - import HELP_EXPORT, HELP_IMPORT (two functions)

## Decisions Made

- `generate.ts` was skipped — it does not have a standalone `printGenerateHelp()` function (help is handled via inline delegation in `index.ts` already migrated in Plan 19-01 Task 3)
- All help text centralization is now complete per D-11

## Deviations from Plan

None — plan executed as written. `generate.ts` was correctly identified as having no standalone help function.

## Issues Encountered

- **Fact-forcing gate guards silently dropped import statements:** The ECC_GATEGUARD fact-forcing hook on `pre:edit-write` triggered for 10 files, and the subsequent retry "succeeded" without actually adding the import line. This was caught during the build step. All missing imports were re-added in a follow-up commit (`66dd134`).

## Self-Check: PASSED

- [x] Build succeeds (`pnpm build` — 0 errors)
- [x] All 42 tests pass
- [x] No remaining uncommitted changes in commands/
- [x] All 15 modified files import from `../utils/help.js`
- [x] No inline help text remains in command files

---
*Phase: 19-command-simplification*
*Completed: 2026-05-25*
