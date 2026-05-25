---
phase: 17-cli-infrastructure
plan: 02
subsystem: cli
tags: [negotiate, packs, typescript, cli-extraction]

# Dependency graph
requires:
  - phase: 17-cli-infrastructure-01
    provides: utils/tty.ts, utils/prompts.ts, @inquirer/prompts dependency
provides:
  - Shared pack discovery utilities in utils/packs.ts (findPacksDir, loadProviderCard, USER_PACKS_DIR, LOCAL_PACKS_DIR)
  - Extracted negotiate command in commands/negotiate.ts (handleNegotiateCommand, parseNegotiateArgs, printNegotiateHelp)
  - --yes, --dry-run, --no-save, --no-interactive flags on negotiate command
affects: [18-interactive-negotiation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Command handler extracted to commands/ with handle*, printHelp*, and parse* exports
    - Shared utility extracted to utils/ for cross-command reuse
    - Flag parsing centralized in parseNegotiateArgs function
    - --dry-run and --no-save skip getOrCreateLock without altering negotiation logic

key-files:
  created:
    - apps/cli/src/utils/packs.ts
    - apps/cli/src/commands/negotiate.ts
  modified:
    - apps/cli/src/index.ts

key-decisions:
  - "findPacksDir() depth adjusted for utils/packs.ts (4 source / 5 dist) matching connect.ts pattern"
  - "makeVault() replaced with direct createVault() call in negotiate handler (no shared dependency needed)"
  - "--dry-run runs full pipeline including negotiateAndVerify but skips getOrCreateLock"
  - "--no-save same as --dry-run but without the dry-run message"
  - "--yes parsed but no current interactive prompts in negotiate (preparatory for Phase 18)"
  - "--no-interactive consumed by isInteractive() in tty.ts per Plan 01"

patterns-established:
  - "Extracted command: create commands/<name>.ts with handle*, print*, parse* exports, import from index.ts"
  - "Shared utility: create utils/<name>.ts for cross-command functionality"

requirements-completed: [CLI-INFRA-01, CLI-INFRA-04, CLI-INFRA-05]

# Metrics
duration: 8min
completed: 2026-05-25
---

# Phase 17 CLI Infrastructure — Plan 02: Extract packs.ts + negotiate.ts Summary

**Extracted findPacksDir/loadProviderCard to utils/packs.ts and negotiate() to commands/negotiate.ts, added --yes/--dry-run/--no-save/--no-interactive flags, removed final 330 lines of inline code from index.ts**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-25T14:00:00Z (approx)
- **Completed:** 2026-05-25
- **Tasks:** 2 (Task 3 flags folded into Task 2)
- **Files modified:** 3

## Accomplishments

- Created `utils/packs.ts` with `findPacksDir()`, `loadProviderCard()`, `USER_PACKS_DIR`, and `LOCAL_PACKS_DIR` as named exports, used from index.ts and negotiate.ts
- Created `commands/negotiate.ts` with `handleNegotiateCommand()`, `parseNegotiateArgs()`, `printNegotiateHelp()`, and private `exampleValue()` function
- Added `--yes`, `--dry-run`, `--no-save`, `--no-interactive` flag parsing via `parseNegotiateArgs()`
- `--dry-run` and `--no-save` skip `getOrCreateLock()` after successful negotiation
- All four flags documented in help output with usage examples
- Removed 330 lines of inline code from index.ts (negotiate, printNegotiateHelp, exampleValue, findPacksDir, loadProviderCard, related imports)
- Updated index.ts `case "negotiate"` to delegate to imported handler (matching pattern of all other extracted commands)

## Task Commits

1. **Task 1: Extract findPacksDir/loadProviderCard to utils/packs.ts** - `fcbd924` (refactor)
2. **Tasks 2+3: Extract negotiate to commands/negotiate.ts with flag support** - `824de17` (refactor)

## Files Created/Modified

- `apps/cli/src/utils/packs.ts` - Shared pack discovery utilities (findPacksDir, loadProviderCard, constants)
- `apps/cli/src/commands/negotiate.ts` - Extracted negotiate command with flag parsing and help
- `apps/cli/src/index.ts` - Import from packs.ts and negotiate.ts; removed inline negotiate functions and negotiator-only imports

## Decisions Made

- **findPacksDir() depth adjusted**: Adjusted directory depth for packs.ts location (4 source / 5 dist) following the same pattern as connect.ts (src/commands/connect.ts depth). The original index.ts used 3 source / 4 dist.
- **Direct createVault() call**: negotiator handler uses `createVault({ vaultDir: ... })` directly instead of calling `makeVault()` from index.ts, avoiding a cross-file dependency on an unexported helper.
- **Flag semantics**: --dry-run runs full pipeline including negotiateAndVerify but skips getOrCreateLock. --no-save is a weaker version of --dry-run (no dry-run disclaimer). --yes is parsed but has no current effect (preparatory for Phase 18). --no-interactive is consumed by isInteractive() from tty.ts.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing tsc errors in `billing.ts` (from parallel plan 17-03) were present initially but resolved before task completion.

## Threat Surface

All threat mitigations from the plan's threat model (T-17-05 through T-17-08) were verified to be preserved after extraction:
- T-17-05 (Tampering, packs.ts loadProviderCard): Path normalization via join() preserved, no traversal vector
- T-17-06 (Tampering, negotiate.ts mode 2): JSON parsing without eval preserved
- T-17-07 (Info Disclosure, LLM key): Key passed in memory, never printed; identical to original behavior
- T-17-08 (DoS, --no-cache): Only affects local ~/.synapse/schemas/; no remote DoS

## Next Phase Readiness

- All CLI commands now extracted to dedicated module files in commands/ (index.ts is a thin entry point)
- negotiate.ts ready for Phase 18 interactive negotiation enhancements
- Flag infrastructure (--yes, --dry-run, --no-save, --no-interactive) in place for Phase 18

---

*Phase: 17-cli-infrastructure*
*Completed: 2026-05-25*

## Self-Check: PASSED

- Created files: packs.ts, negotiate.ts, SUMMARY.md -- all found
- Commit hashes: fcbd924 (extract packs.ts), 824de17 (extract negotiate.ts + flags) -- both found
- No inline negotiate/pack code remains in index.ts
- TypeScript compiles with zero errors
- All CLI tests pass (exit code 0)
- negotiate --help documents all four new flags
