---
phase: 10-cli-billing-commands
plan: 03
subsystem: cli
tags: billing, connect, cli, auto-wrap, createBillingConnector

# Dependency graph
requires:
  - phase: 08-connector-wrapper-filequotastorage
    provides: createBillingConnector wrapper, BillingConnectorConfig types
  - phase: 10-cli-billing-commands
    provides: billing-config.json format, billing init command
provides:
  - synapse connect automatic billing detection and wrapping (CLIBILL-04)
  - --with-billing / --no-billing flag support
  - Interactive prompt per D-06 when billing config exists
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic import pattern for optional billing dependency"
    - "Graceful degradation on billing config/provider/package failure"

key-files:
  created: []
  modified:
    - apps/cli/src/commands/connect.ts

key-decisions:
  - "D-06 followed exactly: check billing-config.json -> prompt -> wrap, with --with-billing/--no-billing flags to skip prompt"
  - "Billing config parsed at runtime, provider config lookup uses billingConfig.providers[provider] structure"
  - "billingWrapperConfig stored as Record<string, unknown> | null, cast through unknown for createBillingConnector"
  - "Three degradation paths: no provider config (warn+skip), parse error (warn+skip), package import failure (warn+skip)"

patterns-established:
  - "CLI flag parsing: --with-billing and --no-billing boolean flags alongside existing flag handlers"

requirements-completed: [CLIBILL-04]

# Metrics
duration: 1m 47s
completed: 2026-05-19
---

# Phase 10 Plan 03: CLI Billing Commands — Connect Auto-Wrap Summary

**synapse connect extended with automatic billing-config.json detection, interactive prompt per D-06, --with-billing/--no-billing flags, and createBillingConnector wrapper wrapping**

## Performance

- **Duration:** 1m 47s
- **Started:** 2026-05-19T09:14:39Z
- **Completed:** 2026-05-19T09:16:26Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- **ConnectOptions interface** extended with `withBilling` field
- **Flag parsing** added for `--with-billing` (force enable, skip prompt) and `--no-billing` (skip billing entirely)
- **Billing detection block** inserted after provider/intent resolution: checks `~/.synapse/billing-config.json`, prompts interactively per D-06
- **Connector execution block** modified to conditionally wrap with `createBillingConnector()` when billing is enabled
- **Graceful degradation** on all failure paths: missing provider config, JSON parse error, package import failure -- all produce warnings and continue without billing
- **printConnectHelp** updated with billing flag documentation and Billing section

## Task Commits

Each task was committed atomically:

1. **Task 1: Add billing detection and auto-wrap to synapse connect** - `54c80c5` (feat)

## Files Created/Modified

- `apps/cli/src/commands/connect.ts` (+74/-2) -- Extended ConnectOptions, flag parsing, billing detection block, billing wrapper on connector execution, updated help text

## Decisions Made

- D-06 implemented exactly as specified: billing config detection, interactive prompt with [Y/n] (empty/y/yes enable, n/no disable), --with-billing/--no-billing to skip prompt
- billingWrapperConfig stored as Record<string, unknown> and cast through unknown to BillingConnectorConfig to satisfy strict TypeScript without importing billing types into CLI
- Provider config lookup uses billingConfig.providers[providerId] structure matching billing-config.json format from Plan 10-01

## Deviations from Plan

None -- plan executed exactly as written.

### Acceptance Criteria Verification

All 13 acceptance criteria are satisfied:
- Grep counts: billing-config.json (1), createBillingConnector (3), with-billing/no-billing/withBilling (11), billingWrapperConfig (4), "Enable billing tracking" (3 in help + prompt), "Proceeding without billing" (2)
- TypeScript compilation passes for connect.ts (only connect.ts errors resolved; pre-existing route.ts/tune.ts errors unchanged)
- --help output includes billing flags and Billing section

## Issues Encountered

- TypeScript strict mode required `as unknown as` intermediate cast for billingWrapperConfig to BillingConnectorConfig -- fixed in the same commit

## User Setup Required

None -- no external service configuration required. Users who have run "synapse billing init" will see billing prompts on their next "synapse connect" call.

## Next Phase Readiness

Phase 10 (CLI Billing Commands) is now complete. All four CLI billing requirements are fulfilled:
- CLIBILL-01: billing init (10-01)
- CLIBILL-02: billing config (10-02)
- CLIBILL-03: billing status (10-02)
- CLIBILL-04: connect auto-wrap (10-03)

---

*Phase: 10-cli-billing-commands*
*Completed: 2026-05-19*
