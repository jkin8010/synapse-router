---
phase: 01-negotiator-reliability
plan: "04"
subsystem: negotiator
tags: [registry, verification-cache, manifest, fire-and-forget, async-submit]

# Dependency graph
requires:
  - phase: 01-negotiator-reliability
    plan: "02"
    provides: ManifestConstraint types, loadManifestFromPack, VerificationResult
  - phase: 01-negotiator-reliability
    plan: "03"
    provides: negotiateAndVerify pipeline, retryWithFeedback, runMockTest
provides:
  - Registry verification async submit (fire-and-forget POST)
  - Remote manifest fetch from Registry with local fallback
  - Local verification result cache (~/.synapse/verifications/)
  - Enhanced manifest loading (local DSL + remote Registry merge)
affects: [registry-client, negotiator, verifier]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget HTTP with 5s timeout + silent catch (Registry async submit)"
    - "Local file cache ~/.synapse/verifications/ replicating LockStorage pattern"
    - "Manifest merge: local priority, remote gap-fill via field-overlap matching"

key-files:
  created:
    - packages/registry-client/src/verify.ts
    - packages/registry-client/src/verify.test.ts
  modified:
    - packages/registry-client/src/index.ts
    - packages/negotiator/package.json
    - packages/negotiator/tsconfig.json
    - packages/negotiator/src/index.ts
    - packages/negotiator/src/manifest.ts
    - packages/negotiator/src/verifier.ts
    - packages/negotiator/src/verifier.test.ts

key-decisions:
  - "extractPackIdentity uses provider.id from provider-card.json as both ns and name for Registry lookup (heuristic, failures handled by local fallback)"
  - "loadManifestEnhanced uses dynamic import for @synapse-router/registry-client inside try-catch for resilience in environments without the package"
  - "cacheVerificationResultLocally uses ~/.synapse/verifications/ directory pattern matching LockStorage (~/.synapse/schemas/)"
  - "VerificationSubmission interface defined in registry-client (not negotiator) to avoid circular dependency between packages"

patterns-established:
  - "Registry-as-optional-enhancement: all Registry calls wrapped in null-client guards + try-catch, pipeline never blocked"
  - "Manifest constraint merge: local takes priority, remote fills gaps via required-field overlap matching"
  - "Verification cache filename: {schema_id}.verification.json in ~/.synapse/verifications/"

requirements-completed: [D-14, D-15, D-16]

# Metrics
duration: 10min
completed: 2026-05-07
---

# Phase 01 Plan 04: Registry Integration Summary

**Fire-and-forget Registry verification submit, local verification cache (~/.synapse/verifications/), and Registry-enhanced manifest loading with local fallback**

## Performance

- **Duration:** ~10min
- **Completed:** 2026-05-07T07:12:22Z
- **Tasks:** 2 completed
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments
- `submitVerification()` in registry-client: fire-and-forget POST to `/api/v1/contract-verifications` with 5s timeout, silent error handling
- `fetchPackManifest()` in registry-client: fetch remote pack spec from Registry, returns null on any failure
- `loadManifestEnhanced()` in negotiator: loads local DSL constraints + optionally merges remote Registry manifest (local priority, D-15)
- `cacheVerificationResultLocally()` in negotiator: writes verification results to `~/.synapse/verifications/{schema_id}.verification.json`
- `negotiateAndVerify()` now creates RegistryClient from `SYNAPSE_REGISTRY_URL` env var, caches results locally, and fire-and-forget submits to Registry (D-16)
- Registry unavailability never blocks the pipeline -- all paths gracefully fall back to local-only operation (D-14)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend registry-client with submitVerification() and fetchPackManifest()** - `4462d1c` (feat)
2. **Task 2: Integrate manifest enhancement + verification cache + async submit** - `98397f6` (feat)

## Files Created/Modified
- `packages/registry-client/src/verify.ts` - VerificationSubmission type, submitVerification, fetchPackManifest
- `packages/registry-client/src/verify.test.ts` - Tests for null-client handling in both functions
- `packages/registry-client/src/index.ts` - Export new verify functions and types
- `packages/negotiator/src/manifest.ts` - loadManifestEnhanced + helpers (extractPackIdentity, extractConstraintsFromManifest, mergeConstraintsEnhanced)
- `packages/negotiator/src/verifier.ts` - cacheVerificationResultLocally, negotiateAndVerify Registry integration
- `packages/negotiator/src/verifier.test.ts` - Tests for cacheVerificationResultLocally file writes
- `packages/negotiator/src/index.ts` - Export loadManifestEnhanced and cacheVerificationResultLocally
- `packages/negotiator/package.json` - Added @synapse-router/registry-client dependency
- `packages/negotiator/tsconfig.json` - Added registry-client project reference

## Decisions Made
- `extractPackIdentity` reads `provider-card.json` and uses `provider.id` as both namespace and name for Registry lookup. If the Registry doesn't have a pack under that identity, `fetchPackManifest` returns null and local constraints are used. This is intentionally simple -- the lookup is a heuristic and failures are handled by the local fallback.
- `loadManifestEnhanced` uses a dynamic `import("@synapse-router/registry-client")` inside a try-catch block. This provides resilience in environments where the package isn't resolvable (monorepo edge cases), but is consistent with the static import used in `verifier.ts` since the package is now a direct dependency.
- `cacheVerificationResultLocally` uses the same `~/.synapse/` directory pattern established by `LockStorage` (~/.synapse/schemas/). Cache file format is `{schema_id}.verification.json` containing schema_id, provider_id, and all VerificationResult fields.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added @synapse-router/registry-client as negotiator dependency**
- **Found during:** Task 2 (verifier.ts import of RegistryClient)
- **Issue:** negotiator/package.json did not include @synapse-router/registry-client in dependencies, but verifier.ts imports RegistryClient and manifest.ts uses dynamic import
- **Fix:** Added `"@synapse-router/registry-client": "workspace:*"` to negotiator dependencies
- **Files modified:** packages/negotiator/package.json
- **Verification:** Tests pass, typecheck passes after adding tsconfig reference
- **Committed in:** 98397f6 (Task 2 commit)

**2. [Rule 3 - Blocking] Added registry-client project reference to negotiator tsconfig.json**
- **Found during:** Task 2 (typecheck failure)
- **Issue:** `tsc -b` requires project references for cross-package imports. Without the registry-client reference, TypeScript reports "File is not under rootDir" errors for all registry-client source files.
- **Fix:** Added `{ "path": "../registry-client" }` to negotiator tsconfig.json references array
- **Files modified:** packages/negotiator/tsconfig.json
- **Verification:** `tsc -b tsconfig.json` completes successfully with zero errors
- **Committed in:** 98397f6 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 blocking)
**Impact on plan:** Both fixes were necessary for compilation correctness. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Registry integration is fully optional; `SYNAPSE_REGISTRY_URL` env var enables remote enhancement but the pipeline works without it.

## Next Phase Readiness
- All D-14, D-15, D-16 requirements completed
- Registry integration is fire-and-forget: local caching is the primary persistence, Registry submission is best-effort
- Contract verification pipeline (negotiate -> manifest match -> generate SDK -> mock test) fully integrated with caching and Registry submission

---
*Phase: 01-negotiator-reliability*
*Completed: 2026-05-07*
