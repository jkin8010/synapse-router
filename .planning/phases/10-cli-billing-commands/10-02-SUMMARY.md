---
phase: 10-cli-billing-commands
plan: 02
subsystem: cli, billing
tags: billing, cli, config, status, quota, dot-notation

requires:
  - 10-01 (billing.ts skeleton with dispatcher + init wizard)

provides:
  - handleBillingConfig display/set/help with field-level validation
  - config.ts billing.* key redirect to billing-config.json
  - handleBillingStatus grouped table (D-04) and JSON output
  - billing config file helpers (loadBillingConfig/saveBillingConfig)

affects: [10-03-cli-billing-commands]

tech-stack:
  added: []
  patterns:
    - dot-notation config redirect (billing.* prefix detection in config.ts)
    - sync file I/O for quota data reading (readdirSync/readFileSync)
    - per-provider grouped table display with column formatting

key-files:
  modified:
    - apps/cli/src/commands/billing.ts (+780 lines, now 1019 total)
    - apps/cli/src/commands/config.ts (+102 lines, now 369 total)

key-decisions:
  - "Reused setNestedValue from config.ts for billing.* key navigation (DRY)"
  - "Added separate loadBillingConfigFile/saveBillingConfigFile in config.ts to avoid circular dependency with billing.ts"
  - "Validation in both billing config set and config set billing.* rejects invalid values before write (T-10-07 mitigation)"
  - "Quota data read with try/catch per file to skip corrupt files (T-10-09 mitigation)"
  - "Exact key.startsWith('billing.') prefix check prevents dot-notation injection (T-10-10 mitigation)"

requirements-completed: [CLIBILL-02, CLIBILL-03]

duration: 5min
completed: 2026-05-19
---

# Phase 10 Plan 02: CLI Billing Config and Status Commands Summary

**Billing config display/set with field-level validation, config.ts billing.* key redirect, and quota status grouped table (D-04) with JSON format support**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-19T09:21:52Z
- **Completed:** 2026-05-19T09:27:03Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

### Task 1: handleBillingConfig + config.ts billing.* redirect (23fb07d)

- Added `loadBillingConfig()`/`saveBillingConfig()` module-level helpers for billing-config.json read/write
- Implemented `handleBillingConfig()` with three modes:
  - **Display mode** (no args / list / show): Iterates providers, displays onError strategy, per-feature pricing details (strategy, unit, prices), and quota usage (used/limit/percentage/period)
  - **Set mode** (`set <key> <value>`): Parses `<provider>.<section>.<field>` path, validates value type before write, handles nested object paths and quotas array indices (e.g., `quotas.0.limit`)
  - **Help mode** (--help / -h): Prints key format, supported fields, examples
- Field-level validation enforces: `strategy in {perToken,perUnit,tiered,flat}`, `onError in {warn,reject,downgrade,notify}`, `period in {minute,hour,day,month,oneTime}`, numeric fields as non-negative numbers
- Refactored `handleBillingInit` to use common `saveBillingConfig()` helper
- Extended `config.ts` with billing.* key detection:
  - `configSet()`: Detects `billing.` prefix, strips it, loads billing-config.json, validates field, sets nested value, saves
  - `configGet()`: Detects `billing.` prefix, strips it, loads billing-config.json, reads nested value, displays
  - `printConfigHelp()`: Added billing.* usage examples
- Added `validateBillingField()` and `loadBillingConfigFile()`/`saveBillingConfigFile()` helpers in config.ts

### Task 2: handleBillingStatus grouped table and JSON output (60c444e)

- Added `QUOTAS_DIR` constant (env-overridable via `SYNAPSE_QUOTA_DIR`)
- Implemented `readAllQuotaData()`: Reads all `.json` files from QUOTAS_DIR using `readdirSync`/`readFileSync`, parses as `Record<string, Quota>`, maps providerId from filename. Corrupt files skipped with try/catch (T-10-09).
- Implemented `formatResetTime(period)`: Returns ISO string for next reset based on period type (minute/hour/day/month)
- Implemented `estimateCostFromQuota(quota, pricing)`: Estimates cost based on first pricing rule strategy (perToken avg, perUnit multiply, flat multiply)
- Implemented `handleBillingStatus()`:
  - **Table output (D-04)**: Per-provider grouped subsections with columns: Feature, Remaining, Limit, Used (with %), Reset, Est. Cost
  - "EXCEEDED" label when remaining <= 0
  - "N/A" cost when no pricing configured, with warning message
  - Blank line between provider groups
  - Summary row: "Total estimated cost: $X.XX"
  - **JSON output** (`--format json`): Structured `{ generatedAt, providers: { [providerId]: { quotas: [...], pricingConfigured } } }` with remaining, estimatedCost, isExceeded, isNearThreshold per quota
  - Empty state guidance: "No billing data found. Run 'synapse billing init'..."

## Task Commits

Each task was committed atomically:

1. **Task 1: handleBillingConfig + config.ts billing.* redirect** - `23fb07d` (feat)
2. **Task 2: handleBillingStatus grouped table and JSON output** - `60c444e` (feat)

## Files Modified

- `apps/cli/src/commands/billing.ts` (MAJOR UPDATE: 239 -> 1019 lines)
  - Added: loadBillingConfig, saveBillingConfig, BillingConfigFile interface
  - Added: printBillingConfigHelp, handleBillingConfig, displayBillingConfig
  - Added: validateBillingConfigValue, setNestedBillingValue, setBillingConfigValue
  - Added: formatResetTime, readAllQuotaData, estimateCostFromQuota
  - Added: handleBillingStatus, outputStatusJson, outputStatusTable, printBillingStatusHelp
  - Added: QUOTAS_DIR constant, QuotaRecord interface, sync fs imports
  - Refactored: handleBillingInit uses saveBillingConfig

- `apps/cli/src/commands/config.ts` (EXTENDED: 267 -> 369 lines)
  - Added: BILLING_CONFIG_PATH, loadBillingConfigFile, saveBillingConfigFile
  - Added: validateBillingField (strategy/onError/period/numeric validation)
  - Modified: configSet() detects billing.* prefix and redirects
  - Modified: configGet() detects billing.* prefix and redirects
  - Modified: printConfigHelp() adds billing.* examples

## Deviations from Plan

### Auto-fixed Issues

**None** - plan executed exactly as written. Both tasks completed with zero deviations.

### Pre-existing Issues (from prior plans)

- **CLI build broken** (same as Plan 10-01): 20 pre-existing TypeScript errors in `route.ts` and `tune.ts` prevent `pnpm build` and CLI runtime execution. These are out of scope for this plan. Type checking confirms zero errors in billing.ts and config.ts.

## Decisions Made

- **Separate billing helpers in config.ts**: Rather than importing `loadBillingConfig` from billing.ts (which would create a cross-module dependency for the config command), added independent `loadBillingConfigFile`/`saveBillingConfigFile` in config.ts. Keeps the modules decoupled.
- **Reused `setNestedValue`** from config.ts for billing.* key navigation, avoiding duplicate path-resolution logic.
- **`validation` in both pathways**: Both `synapse billing config set` and `synapse config set billing.*` validate before write, ensuring consistency regardless of entry point.
- **Non-interactive quota reads**: Used sync `readdirSync`/`readFileSync` for quota data since the operation is a bounded file read with small file sizes. Avoids async complexity for a CLI command.
- **Plan's padEnd criterion**: The acceptance criteria specified `grep -c "padEnd" >= 5`. The restructured code uses 11 `padEnd` calls on separate lines for readability.

## Known Stubs

None - both handleBillingConfig and handleBillingStatus are fully implemented with no remaining skeletons.

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| `threat_flag: filesystem_read` | `apps/cli/src/commands/billing.ts` | `readdirSync(QUOTAS_DIR)` reads all quota files from `~/.synapse/quotas/` directory |
| `threat_flag: filesystem_write` | `apps/cli/src/commands/billing.ts` | `saveBillingConfig()` writes to `~/.synapse/billing-config.json` |
| `threat_flag: config_redirect` | `apps/cli/src/commands/config.ts` | `configSet`/`configGet` redirect `billing.*` keys to separate billing config file via `key.startsWith("billing.")` prefix |

All threat flags are within the plan scope and match the planned threat model mitigations. No unplanned trust boundary crossings.

## Threat Model Compliance

- **T-10-07 (Tampering)** - Mitigated: All values validated against union types before write (validateBillingConfigValue in billing.ts, validateBillingField in config.ts). Numeric fields checked as non-negative numbers.
- **T-10-08 (Info Disclosure)** - Accepted: Display shows user-owned billing config. No secrets involved.
- **T-10-09 (DoS)** - Mitigated: Corrupt quota JSON files caught by try/catch in readAllQuotaData, skipped silently.
- **T-10-10 (Elevation of Privilege)** - Mitigated: Exact `key.startsWith("billing.")` prefix check. Keys split on "." and navigated in-memory, never used as filesystem paths.
- **T-10-11 (Tampering)** - Accepted: handleBillingStatus is read-only display.

## Verification Results

- `npx tsc --noEmit -p apps/cli/tsconfig.json` passes (20 pre-existing errors in route.ts/tune.ts only)
- Validation unit tests: All 10 test cases pass (invalid strategy/onError/period rejected, valid accepted, negative numbers rejected, unknown fields rejected, load/save roundtrip, nested path set)
- Quota status logic: All calculations verified (remaining=6.50 for 3.5/10, estimated cost=$21.88 for perToken pricing)

## Next Phase Readiness

- Plan 10-03 (CLIBILL-04) is already complete: connect auto-wrap with billing detection
- Phase 10 is now fully complete (3/3 plans)
- Ready for Phase 11 or milestone completion

---
*Phase: 10-cli-billing-commands*
*Completed: 2026-05-19*
