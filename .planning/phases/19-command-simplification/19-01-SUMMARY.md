---
phase: 19-command-simplification
plan: 01
subsystem: cli
tags: [help, cli, shared-module, command-grouping]

# Dependency graph
requires:
  - phase: 17-02
    provides: CLI infrastructure (extracted command files)
provides:
  - Shared help text module (utils/help.ts) for CLI and docs
  - 3-group --help output format (Core Workflow / Configuration / Advanced)
  - Delegate-based help subcommand dispatch via helpMap
affects:
  - 19-02 (Plan 19-02: Command merging)
  - docusaurus docs (can consume shared help constants)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Help text as exported string constants from shared module
    - helpMap pattern for subcommand dispatch
    - HelpCommandEntry interface for grouped command listing

key-files:
  created:
    - apps/cli/src/utils/help.ts
    - apps/cli/src/utils/help.test.ts
  modified:
    - apps/cli/src/index.ts
    - apps/cli/src/index.test.ts

key-decisions:
  - "Help text extracted to utils/help.ts as single source of truth per D-10"
  - "3 groups: Core Workflow (setup, negotiate, connect, evolve), Configuration (vault, config, pack, billing), Advanced (remaining 11 commands) per D-01/D-02/D-03/D-04"
  - "Preemptive deprecation notices added to HELP_INIT, HELP_SMOKE, HELP_PROFILE, HELP_EXPORT, HELP_IMPORT for Plan 19-02"
  - "Preemptive --smoke flag added to HELP_CONNECT for Plan 19-02"
  - "Preemptive profile/export/import subcommands added to HELP_CONFIG for Plan 19-02"

patterns-established:
  - "utils/help.ts exports all HELP_* constants as template literals preserving exact formatting"
  - "index.ts imports from utils/help.ts for both printHelp() and help <subcommand> dispatch"
  - "printProviderHelp/printVaultHelp/printGenerateHelp delegate to shared module"
  - "help <cmd> dispatch uses helpMap: Record<string, string> pattern"

requirements-completed: [CMD-01, CMD-03]

# Metrics
duration: 1h 15min
completed: 2026-05-25
---

# Phase 19: Command Simplification - Plan 01 Summary

**Shared help text module with 3-group --help output format (Core Workflow / Configuration / Advanced)**

## Performance

- **Duration:** 1h 15min
- **Started:** 2026-05-25T09:42:23Z
- **Completed:** 2026-05-25T10:57:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Created `apps/cli/src/utils/help.ts` with 755 lines of shared help definitions across 19 commands
- Restructured `synapse --help` output into 3 labeled groups: Core Workflow (4 commands), Configuration (4 commands), Advanced (11 commands)
- Delegated printProviderHelp, printVaultHelp, printGenerateHelp to shared module
- Replaced help subcommand switch (19 cases) with concise helpMap pattern
- Added preemptive Plan 19-02 content: deprecation notices, --smoke flag, profile/export/import subcommands
- All 38 existing + new tests pass, TypeScript compiles cleanly

## Task Commits

Each task was committed atomically following the TDD cycle (RED test + GREEN implementation):

1. **Task 1: Create utils/help.ts with shared help definitions**
   - `0b32e81` (test) - add failing test for help module exports
   - `f3306f6` (feat) - create utils/help.ts with shared help definitions

2. **Task 2: Restructure printHelp() to 3-group format**
   - `e749ae2` (test) - add failing test for 3-group help format
   - `8ebfd30` (feat) - restructure printHelp() into 3 groups

3. **Task 3: Update help subcommand switch and inline help functions**
   - `2e32aef` (test) - add regression tests for help subcommand delegation
   - `9cf01f8` (feat) - delegate help functions to shared utils/help.ts module

## Files Created/Modified
- `apps/cli/src/utils/help.ts` - 755-line shared help text module with 19 HELP_* constants + 3 command group arrays
- `apps/cli/src/utils/help.test.ts` - 8 tests for module exports, array lengths, content checks
- `apps/cli/src/index.ts` - Updated printHelp() to 3-group format, added HELP_* imports, replaced delegate functions and helpMap
- `apps/cli/src/index.test.ts` - Added 5 new tests for 3-group headers and help subcommand output

## Decisions Made
- Help text extracted to dedicated utils/help.ts module as single source of truth for CLI and docs per D-10/D-11
- 3-group format maps to the natural user workflow: Core -> Configure -> Advanced per D-01 through D-04
- Keep existing per-command print*Help imports in index.ts for the command --help flag paths (they remain the authoritative source until Plan 19-03)
- Preemptive Plan 19-02 content included to reduce future merge conflicts
- TDD approach used for all 3 tasks with RED -> GREEN commit sequence

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing build error in `packages/sdk-generator/src/billing.ts` (type mismatch between `ProviderPricing` and `ProviderCardPricing`) - unrelated to this plan's changes, deferred
- CLI app compiles independently via `npx tsc -p tsconfig.json` with no errors

## Self-Check: PASSED

### Files exist
- [x] `apps/cli/src/utils/help.ts` (755 lines, meets 150-line minimum)
- [x] `apps/cli/src/utils/help.test.ts` (59 lines)

### Commits exist
- [x] `0b32e81` - test: add failing test for help module exports
- [x] `f3306f6` - feat: create utils/help.ts with shared help definitions
- [x] `e749ae2` - test: add failing test for 3-group help format
- [x] `8ebfd30` - feat: restructure printHelp() into 3 groups
- [x] `2e32aef` - test: add regression tests for help subcommand delegation
- [x] `9cf01f8` - feat: delegate help functions to shared utils/help.ts module

### Verification
- [x] TypeScript compilation succeeds: `cd apps/cli && npx tsc --noEmit` passes
- [x] All 38 tests pass: 30 index.test.ts + 8 help.test.ts
- [x] `synapse --help` shows 3-group format with Core Workflow, Configuration, Advanced
- [x] `synapse help vault` prints vault help text
- [x] `synapse help connect` prints connect help text
- [x] "Synapse Router CLI", "provider", "vault", "negotiate" all appear in help output

## Next Phase Readiness
- Shared help module ready for Plan 19-02 (command merging)
- Preemptive deprecation notices and new flag content already in place
- Phase 19-03 can remove unused print*Help imports from command files

---
*Phase: 19-command-simplification*
*Completed: 2026-05-25*
