# Deferred Items — Phase 13

## Pre-existing build failure: packages/sdk-generator

**Discovered during:** Plan 13-03 Task 1 verification

**Issue:** `pnpm build` fails in `packages/sdk-generator/src/billing.ts` due to type mismatch:
- `ProviderPricing` is not assignable to `ProviderCardPricing` (lines 17 and 115)
- The two types have no properties in common

**Root cause:** Pre-existing — not caused by Phase 13 changes. Likely introduced when billing types were refactored but sdk-generator wasn't updated to match.

**Impact:** Only `sdk-generator` package affected. Other 14 packages build successfully. Does not block docs build (`pnpm build:docs` works independently).

**Suggested fix:** Update `packages/sdk-generator/src/billing.ts` to use `ProviderCardPricing` type (the equivalent type in `@synapse-router/billing`) instead of `ProviderPricing`.
