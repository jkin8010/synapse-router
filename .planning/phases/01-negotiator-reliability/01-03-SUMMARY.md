---
phase: 01-negotiator-reliability
plan: 03
subsystem: negotiator
tags: [pipeline, retry, verification, integration]
type: execute
wave: 2
depends_on: [01, 02]
provides:
  - negotiateAndVerify pipeline (negotiateSchema -> manifestMatch -> generateSdk -> mockTest)
  - retryWithFeedback with MAX_RETRIES=2 and structured LLM prompt injection
  - app integration across CLI, MCP Server, and HTTP API
requires:
  - Manifest types and matcher (Plan 01-02)
  - ContractVerificationError (Plan 01-02)
  - MockServer (Plan 01-01)
  - SDK Generator (existing)
tech-stack:
  added:
    - "@synapse-router/contract-mocker" as negotiator dependency
    - "@synapse-router/sdk-generator" as negotiator dependency
  patterns:
    - Dynamic import for retry module to break circular dependency
    - _verification_feedback constraint injection for LLM prompt
    - Hard-coded MAX_RETRIES=2 for DoS prevention
key-files:
  created:
    - packages/negotiator/src/verifier.ts (negotiateAndVerify, runMockTest, mergeConstraints)
    - packages/negotiator/src/verifier.test.ts (9 tests: 5 mergeConstraints + 4 runMockTest)
    - packages/negotiator/src/retry.ts (retryWithFeedback, buildFeedbackPrompt, MAX_RETRIES=2)
    - packages/negotiator/src/retry.test.ts (8 tests: 4 buildFeedbackPrompt + 4 retryWithFeedback)
  modified:
    - packages/negotiator/src/index.ts (new exports)
    - packages/negotiator/package.json (new deps: contract-mocker, sdk-generator)
    - packages/negotiator/tsconfig.json (new references)
    - apps/cli/src/commands/connect.ts (import negotiateAndVerify)
    - apps/cli/tsconfig.json (add negotiator+contract-mocker refs)
    - apps/mcp-server/src/tools.ts (replace negotiateSchema with negotiateAndVerify)
    - apps/api/src/index.ts (add verification_result to /negotiate response)
decisions:
  - D-21: verify pipeline step order: negotiateSchema -> loadManifest -> matchManifest -> generateSdk -> runMockTest
  - D-22: retryWithFeedback re-negotiates with _verification_feedback injected as constraints field
  - D-23: MAX_RETRIES hard-coded at 2; throws ContractVerificationError on exhaustion
  - D-24: Circular dependency between verifier.ts and retry.ts resolved via dynamic import for retry module
  - D-25: API server /negotiate preserves existing intent-matching negotiate() flow; negotiateAndVerify runs when task/goal fields provided
  - D-26: CLI connect command preserves lock-based getOrCreateLock flow; negotiateAndVerify imported for future integration
metrics:
  duration: "21min"
  tasks: 4
  files: 11
  completed_date: "2026-05-07T06:54:48Z"
  status: complete
---

# Phase 01 Plan 03: Pipeline orchestration + retry logic + app integration

Pipeline integration unifying schema negotiation, manifest verification, mock testing, and retry with structured LLM feedback across all three app entry points.

## Tasks

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | negotiateAndVerify pipeline | 0d25f37 | verifier.ts, verifier.test.ts |
| 2 | retryWithFeedback logic | 347836f | retry.ts, retry.test.ts |
| 3 | negotiator index exports | 2e91b2c | index.ts |
| 4 | app integration | 5565469 | connect.ts, tools.ts, index.ts (api) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] CLI tsconfig missing negotiator project reference**
- **Found during:** Task 4 typecheck
- **Issue:** CLI typecheck failed with TS6307 because `@synapse-router/negotiator` was not listed in tsconfig project references
- **Fix:** Added `negotiator` and `contract-mocker` to CLI tsconfig references
- **Files modified:** apps/cli/tsconfig.json
- **Commit:** 5565469

**2. [Rule 3 - Blocking] Connect command uses lock system, not direct negotiateSchema**
- **Found during:** Task 4 implementation
- **Issue:** The connect command uses `getOrCreateLock` from `@synapse-router/lock` which builds schemas from provider cards. It does not call `negotiateSchema` directly, so the plan's template to "replace negotiateSchema with negotiateAndVerify" did not apply.
- **Fix:** Imported `negotiateAndVerify` for future integration; preserved existing lock-based flow. The MCP server and API server received the full negotiateAndVerify integration.
- **Files modified:** apps/cli/src/commands/connect.ts
- **Commit:** 5565469

## Self-Check

- [x] verifier.ts exists and exports negotiateAndVerify, runMockTest
- [x] retry.ts exists with MAX_RETRIES=2, retryWithFeedback, buildFeedbackPrompt
- [x] index.ts exports all new types and functions (backward compatible)
- [x] All 38 negotiator tests pass
- [x] @synapse-router/negotiator typecheck passes
- [x] @synapse-router/cli typecheck passes
- [x] @synapse-router/mcp-server typecheck passes
- [x] @synapse-router/api typecheck passes
- [x] All 4 task commits exist: 0d25f37, 347836f, 2e91b2c, 5565469
- [x] No stubs in new code
- [x] ContractVerificationError thrown on attempt >= MAX_RETRIES
- [x] _verification_feedback injected into constraints for LLM retry prompt
