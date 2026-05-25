---
phase: 19-command-simplification
plan: 02
subsystem: cli
tags: [cli, command-routing, deprecation, smoke, init, profile, export, import]

requires:
  - phase: 19-01
    provides: shared HELP_* constants and updated help text with deprecation notices

provides:
  - smoke merged into connect --smoke (D-05)
  - init merged into setup (D-06)
  - profile/export/import merged into config subcommands (D-07, D-08)
  - Provider command remains standalone (D-09)

affects:
  - CLI command structure
  - User-facing command naming

tech-stack:
  added: []
  patterns:
    - Old command names redirect with deprecation warnings on stderr
    - HELP_* constants in help.ts contain deprecation notices at top
    - Delegation via rawArgs construction in index.ts switch cases

key-files:
  modified:
    - apps/cli/src/index.ts (smoke/init/profile/export/import redirects)
    - apps/cli/src/commands/connect.ts (--smoke flag handler + help text)
    - apps/cli/src/commands/config.ts (profile/export/import subcommands + help text)
    - apps/cli/src/index.test.ts (14 new tests for redirect behavior)

key-decisions:
  - "Deprecation warnings go to stderr (not stdout) so JSON/table output is not corrupted"
  - "smoke delegates to connect --smoke via handleConnectCommand with --smoke prepended to rawArgs"
  - "init passes rawArgs as-is to handleSetupCommand so --provider, --out-dir, --with-cicd work"
  - "profile/export/import slice argv[1:] to pass remaining args to their handler functions"

patterns-established:
  - "Command redirect pattern: deprecation on stderr + delegate via handle*Command with modified rawArgs"
  - "TDD test pattern for CLI command behavior using child_process.spawnSync against dist/index.js"

requirements-completed:
  - CMD-02

duration: 6min
completed: 2026-05-25
---

# Phase 19 Plan 02: Command Simplification -- Merge smoke/init/profile/export/import

**Merged 5 top-level commands into 3 parent commands with deprecation warnings: smoke into connect --smoke, init into setup, profile/export/import into config subcommands. Provider stays standalone.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-25T09:54:10Z
- **Completed:** 2026-05-25T10:00:04Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- smoke command now redirects to connect --smoke with deprecation warning on stderr
- init command now redirects to setup with deprecation warning on stderr
- profile/export/import now available as config subcommands with old top-level names redirecting
- Provider command remains standalone (per D-09)
- All deprecation warnings go to stderr so stdout-based scripts (JSON/table) are not broken
- 14 new tests verify redirect behavior and deprecation messages

## Task Commits

Each task was committed atomically following TDD discipline:

1. **Task 1: Add --smoke flag to connect command and redirect smoke** - `3936560` (feat)
2. **Task 2: Redirect init to setup** - `83b3f40` (feat)
3. **Task 3: Add profile/export/import subcommands to config** - `2cb9b8e` (feat)

**Plan metadata:** `f7fcf38` (fix: add profile/export/import to printConfigHelp())

## Files Created/Modified

- `apps/cli/src/index.ts` - Updated smoke/init/profile/export/import case blocks to redirect with deprecation warnings
- `apps/cli/src/commands/connect.ts` - Added --smoke detection in handleConnectCommand that delegates to handleSmokeCommand; added --smoke to printConnectHelp()
- `apps/cli/src/commands/config.ts` - Added profile/export/import subcommand cases that delegate to respective handlers; added subcommands to printConfigHelp()
- `apps/cli/src/index.test.ts` - Added 14 new tests for redirect behavior across all changed commands

## Decisions Made

- **Deprecation on stderr:** All deprecation warnings go to stderr (via `console.error`) so parsed output is not corrupted
- **rawArgs passthrough:** Old command names construct modified rawArgs and pass to the new handler -- this preserves all subcommand arguments and flags
- **Provider left unchanged:** per D-09, the provider command routing is untouched

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] printConfigHelp() missing profile/export/import subcommands**

- **Found during:** Task 3 (verification step 7)
- **Issue:** `printConfigHelp()` in config.ts did not list profile/export/import as subcommands, making them invisible to users
- **Fix:** Added three lines to the Subcommands section in printConfigHelp() matching the HELP_CONFIG text in help.ts
- **Files modified:** apps/cli/src/commands/config.ts
- **Verification:** `node dist/index.js config --help` now shows profile/export/import
- **Committed in:** f7fcf38 (separate fix commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary for users to discover the new subcommand locations. No scope creep.

## Issues Encountered

None -- all changes followed the plan specification closely.

## Self-Check

- [x] All modified files exist (index.ts, connect.ts, config.ts, index.test.ts)
- [x] All commits exist (3936560, 83b3f40, 2cb9b8e, f7fcf38)
- [x] All 42 tests pass (33 original + 14 new)
- [x] TypeScript compilation passes
- [x] All 10 verification checks from plan pass

## Next Phase Readiness

- CLI command surface area reduced from ~20 to ~15 top-level commands
- Plan 19-03 can proceed with any remaining simplification work
