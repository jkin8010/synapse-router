---
phase: 08-connector-wrapper-filequotastorage
plan: 08-01
subsystem: billing
tags: quota-storage, file-io, pricing, atomic-writes, node-fs

# Dependency graph
requires:
  - phase: 07-billing-core-foundation
    provides: Billing class, QuotaManager, PricingRule types, QuotaStorage interface
provides:
  - FileQuotaStorage implementing QuotaStorage with atomic file persistence
  - pricingFromProviderCard() bridge from provider-card pricing to PricingRule
  - BillingResult, BillingOnError, BillingConnectorConfig types for billing connector wrapper
affects:
  - 08-02-connector-wrapper-filequotastorage (wrapper module consuming these building blocks)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Atomic file write (.tmp + renameSync)
    - Env-var test isolation (SYNAPSE_QUOTA_DIR)
    - Pure function pricing bridge
    - Whitelist-based per-unit recognition

key-files:
  created:
    - packages/billing/src/file-storage.ts
    - packages/billing/src/file-storage.test.ts
    - packages/billing/src/pricing-bridge.ts
    - packages/billing/src/pricing-bridge.test.ts
  modified:
    - packages/billing/package.json
    - packages/billing/src/types.ts

key-decisions:
  - "saveQuota() is synchronous (void return) because QuotaManager.consume() calls it without await"
  - "getAll() is implemented despite not being in QuotaStorage interface, because QuotaManager accesses it via cast"
  - "Known per-unit keywords whitelist (image, minute, second, hour, etc.) for pricing bridge instead of broad /^per\\s/ regex"

patterns-established:
  - "FileQuotaStorage: writeFileSync + renameSync atomic .tmp pattern"
  - "FileQuotaStorage: SYNAPSE_QUOTA_DIR env var for test isolation (same pattern as MemoryStorage)"
  - "pricing-bridge: pure function with 3-tier strategy detection (token -> perUnit -> flat)"

requirements-completed:
  - WRAPPER-02
  - WRAPPER-03

duration: 5min
completed: 2026-05-10
---

# Phase 08 Connector Wrapper FileQuotaStorage Plan 08-01 Summary

**FileQuotaStorage with atomic .tmp+rename persistence, pricing-bridge converting provider-card pricing to PricingRule format, and new billing wrapper types (BillingResult, BillingOnError, BillingConnectorConfig)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-10T02:26:20Z
- **Completed:** 2026-05-10T02:30:51Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- FileQuotaStorage class implementing QuotaStorage with synchronous atomic file writes (.tmp + renameSync)
- 11 tests for FileQuotaStorage: CRUD, atomicity, clone protection, cross-instance persistence, corrupt file recovery, first-run directory creation
- pricingFromProviderCard() pure function handling all 4 provider card scenarios (openai tokens, stability per-image, replicate/comfyui undefined, empty/missing fields)
- 9 tests for pricing-bridge covering undefined, perToken, perUnit, flat, empty object, missing fields, unrecognized units
- New types (BillingResult, BillingOnError, BillingConnectorConfig) appended to types.ts
- @synapse-router/connector workspace dependency added to billing package

## Task Commits

Each task was committed atomically:

1. **Task 1: Add workspace dependency and new billing wrapper types** - `641ac8e` (feat)
2. **Task 2: Create FileQuotaStorage with atomic file persistence and tests** - `f84ca7f` (feat)
3. **Task 3: Create pricing-bridge function and tests** - `a87bc50` (feat)

**Plan metadata:** (final commit after summary)

## Files Created

- `packages/billing/src/file-storage.ts` - FileQuotaStorage class (sync I/O, atomic .tmp+rename, QuotaStorage implementation)
- `packages/billing/src/file-storage.test.ts` - 11 test cases covering all FileQuotaStorage behaviors
- `packages/billing/src/pricing-bridge.ts` - pricingFromProviderCard() pure function
- `packages/billing/src/pricing-bridge.test.ts` - 9 test cases covering all provider card scenarios

## Files Modified

- `packages/billing/package.json` - Added @synapse-router/connector workspace dependency
- `packages/billing/src/types.ts` - Added BillingResult, BillingOnError, BillingConnectorConfig types

## Decisions Made

- **saveQuota() is synchronous (void return):** QuotaManager.consume() calls `this.storage.saveQuota(quota)` without `await` at quota.ts:71. Making it async would require interface changes across all callers. FileQuotaStorage uses synchronous `writeFileSync` + `renameSync`.
- **getAll() implemented without interface change:** QuotaManager accesses storage via `(this.storage as any).getAll?.()` at quota.ts:100,158. FileQuotaStorage implements `getAll(): Quota[]` following the same pattern as MemoryStorage, despite QuotaStorage interface not declaring it.
- **Per-unit keyword whitelist:** The plan's suggested regex `/^per\s/i.test(unit) && !/call|request/i.test(unit)` would classify "per potato" (unrecognized unit) as perUnit instead of flat. Used a whitelist of known per-unit keywords for accurate classification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Per-unit regex too broad, classified unrecognized units as perUnit**
- **Found during:** Task 3 (pricing-bridge test)
- **Issue:** The plan's suggested regex `/^per\s/i.test(unit) && !/call|request/i.test(unit)` matched "per potato" as perUnit, contradicting the plan's own rule that "any unrecognized unit" should be flat
- **Fix:** Added whitelist of known per-unit keywords (image, minute, second, hour, day, character, word, page, item, unit) to only classify recognizable measurement units as perUnit
- **Files modified:** packages/billing/src/pricing-bridge.ts
- **Verification:** All 9 pricing-bridge tests pass
- **Committed in:** a87bc50 (Task 3 commit)

**2. [Rule 3 - Blocking] ESM require() not available in test file**
- **Found during:** Task 2 (file-storage.test.ts test run)
- **Issue:** Two tests used `require("node:fs")` which fails in ESM context ("type": "module" in package.json)
- **Fix:** Changed to import `existsSync` at the top level alongside other imports, removed `require()` calls
- **Files modified:** packages/billing/src/file-storage.test.ts
- **Verification:** All 11 FileQuotaStorage tests pass
- **Committed in:** f84ca7f (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

- ESM module context prevents use of `require()` in test files, fixed by importing all needed functions at top level

## Threat Surface Scan

No new threat surface introduced beyond what the plan's threat model covers:
- FileQuotaStorage file path: Provider ID from provider-card.json, path.join normalizes traversal
- Atomic write: .tmp + renameSync prevents partial/corrupt writes
- Corrupt JSON: try/catch in load() prevents crash
- Pricing bridge: undefined input returns sensible default, never throws

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Building blocks ready for Plan 08-02 (wrapper module):
  - FileQuotaStorage ready for `createBillingConnector()` factory to use as storage backend
  - pricingFromProviderCard() ready for provider card to PricingRule conversion
  - BillingResult/BillingOnError/BillingConnectorConfig types ready for wrapper signatures
  - Existing billing test suite: all 112 tests passing

---
*Phase: 08-connector-wrapper-filequotastorage*
*Completed: 2026-05-10*

## Self-Check: PASSED

- All 4 created files verified present
- All 3 commit hashes verified in git log
- Full billing test suite: 112 tests, 0 failures
