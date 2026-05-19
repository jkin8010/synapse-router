---
phase: 10-cli-billing-commands
plan: 01
subsystem: cli, billing
tags: billing, cli, init, interactive-wizard, readline

requires: []
provides:
  - billing command module (billing.ts) with init wizard, config/status skeletons
  - billing dispatch routing in main CLI (index.ts)
  - billing-config.json write path at ~/.synapse/billing-config.json
affects: [10-02-cli-billing-commands, 10-03-cli-billing-commands]

tech-stack:
  added: []
  patterns:
    - readline-based interactive wizard pattern (reused single rl interface)
    - provider card scanning with pricing auto-detection via pricingFromProviderCard

key-files:
  created:
    - apps/cli/src/commands/billing.ts
  modified:
    - apps/cli/src/index.ts
    - apps/cli/package.json
    - apps/cli/tsconfig.json
    - pnpm-lock.yaml

key-decisions:
  - "Added @synapse-router/billing as CLI dependency and tsconfig reference (Rule 3 - blocking issue, needed for compilation)"

requirements-completed: [CLIBILL-01]

duration: 2min
completed: 2026-05-19
---

# Phase 10 Plan 01: CLI Billing Init Wizard Summary

**Billing init interactive wizard with provider pack scanning, per-feature pricing auto-detection, and flag-based non-interactive mode via new billing command module**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-19T09:10:49Z
- **Completed:** 2026-05-19T09:12:44Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created `apps/cli/src/commands/billing.ts` (502 lines) with full billing command module:
  - `printBillingHelp()` -- help text for init/config/status subcommands
  - `handleBillingCommand()` -- dispatcher routing to init/config/status/help
  - `handleBillingInit()` -- full interactive wizard (D-01: interactive with flag overrides)
  - Per-feature pricing configuration (D-02: per-feature granularity)
  - Auto-detected pricing from provider cards via `pricingFromProviderCard()` (D-03)
  - `handleBillingConfig()` / `handleBillingStatus()` skeleton stubs for Plan 10-02
- Wired billing command into main CLI dispatcher (index.ts) with import, printHelp listing, main switch case, and help sub-switch
- All flag values validated against union types before use (T-10-05 mitigation)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create billing command module** - `7660748` (feat)
2. **Task 2: Wire billing into CLI dispatcher** - `68b69a5` (feat)

**Plan metadata:** Pending final metadata commit

## Files Created/Modified

- `apps/cli/src/commands/billing.ts` (NEW, 502 lines) -- Full billing command module with init wizard, dispatcher, and skeleton subcommands
- `apps/cli/src/index.ts` (modified, +13 lines) -- Import + printHelp listing + switch case + help sub-switch
- `apps/cli/package.json` (modified) -- Added `@synapse-router/billing: "workspace:*"` dependency
- `apps/cli/tsconfig.json` (modified) -- Added `{ "path": "../../packages/billing" }` project reference
- `pnpm-lock.yaml` (modified) -- Updated by `pnpm install`

## Decisions Made

- Added `@synapse-router/billing` to CLI package dependencies and tsconfig project references -- required for the `import { pricingFromProviderCard }` to compile in the CLI's composite build context
- Used a single readline interface reused across all prompts (closed in `finally` block) per plan spec
- Used `Record<string, object>` for pricing maps to avoid TypeScript index signature issues with `PricingRule` type

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing @synapse-router/billing dependency and tsconfig reference**
- **Found during:** Task 1 (Create billing command module)
- **Issue:** `@synapse-router/billing` was not in the CLI's `package.json` dependencies or `tsconfig.json` project references, so `import { pricingFromProviderCard }` from billing would fail at compile time
- **Fix:** Added `"@synapse-router/billing": "workspace:*"` to dependencies and `{ "path": "../../packages/billing" }` to tsconfig references, ran `pnpm install`
- **Files modified:** `apps/cli/package.json`, `apps/cli/tsconfig.json`, `pnpm-lock.yaml`
- **Verification:** `npx tsc --noEmit -p apps/cli/tsconfig.json` passes (zero billing errors)
- **Committed in:** `7660748` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed PricingRule to Record<string, unknown> type cast**
- **Found during:** Task 1 verification (tsc compilation)
- **Issue:** `PricingRule` has no index signature, so `as Record<string, unknown>` single cast fails in TypeScript 5.9 strict mode
- **Fix:** Changed pricing map type from `Record<string, unknown>` to `Record<string, object>`, and used `{ ...rule, strategy: ... }` spread pattern instead of mutation for the non-interactive function
- **Files modified:** `apps/cli/src/commands/billing.ts`
- **Verification:** `npx tsc --noEmit -p apps/cli/tsconfig.json` passes (zero billing errors)
- **Committed in:** `7660748` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for correct compilation. No scope creep.

## Issues Encountered

- **Pre-existing build errors in route.ts and tune.ts (out of scope):** The CLI has 20 pre-existing TypeScript errors in `apps/cli/src/commands/route.ts` and `apps/cli/src/commands/tune.ts` (missing exports from `@synapse-router/router` and symbol conversion issues). These prevent `pnpm build` from completing and prevent the CLI from starting at runtime (`node dist/index.js`). The billing.ts and index.ts changes compile correctly (zero billing errors verified). These pre-existing issues were present before this plan's changes and are documented in deferred items.

## Known Stubs

- `handleBillingConfig()` and `handleBillingStatus()` are skeleton functions that print "coming soon" and call `process.exit(0)` -- these are intentionally stubbed per the plan and will be implemented in Plan 10-02.

## Next Phase Readiness

- Plan 10-02 can extend `handleBillingConfig()` and `handleBillingStatus()` with full implementations
- Plan 10-03 can add billing auto-wrap to `handleConnectCommand()` in `connect.ts`
- The billing-config.json schema and write path are established with `version: "1"`

---
*Phase: 10-cli-billing-commands*
*Completed: 2026-05-19*
