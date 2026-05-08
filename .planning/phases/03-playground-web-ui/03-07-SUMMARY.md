---
phase: 03-playground-web-ui
plan: 07
subsystem: ui
tags: [gap-closure, base-url, provider-card, provider-selector, hook-wiring, playground]
wave: 5
dependency_graph:
  requires:
    - phase: 03-06
      provides: "service.base_url in ProviderCard type, selectedBaseUrl in AppState, baseUrl param in API client"
  provides:
    - "Provider card displays service.base_url with URL label"
    - "Provider selector inline base URL override input with reset button"
    - "useNegotiate passes selectedBaseUrl to apiClient.negotiate()"
    - "useExecute passes selectedBaseUrl to apiClient.execute()"
  affects: [playground-users]
tech_stack:
  added: []
  patterns:
    - "base_url display from ProviderCard.service data with truncate for long URLs"
    - "inline base_url override input wired to SET_BASE_URL dispatch with placeholder from card data"
    - "selectedBaseUrl read in hooks and passed to API client as 3rd arg or params.baseUrl"
    - "selectedBaseUrl in useCallback dependency arrays for correct closure behavior"
key_files:
  created: []
  modified:
    - apps/playground/src/components/ProviderCard.tsx
    - apps/playground/src/components/ProviderSelector.tsx
    - apps/playground/src/hooks/useNegotiate.ts
    - apps/playground/src/hooks/useExecute.ts
  deleted: []
key_decisions:
  - "Switching providers clears base_url override (SET_BASE_URL null) to avoid stale overrides"
  - "selectedBaseUrl ?? undefined passed to API client when null, so API falls back to provider-card.json default"
  - "Reset button (X icon) shown only when override is active"
requirements_completed: [PLAYGROUND-03]
metrics:
  duration: "~5 minutes"
  files_created: 0
  files_modified: 4
  files_deleted: 0
  typecheck_playground: PASS
  tests_playground: 5/5 PASS
  completed_date: "2026-05-08"
---

# Phase 3 Plan 7: base_url UI Display + Override Input + Hook Wiring -- Summary

## One-liner

ProviderCard displays `service.base_url` from provider data, ProviderSelector shows inline base_url override input with default placeholder and reset button, and both useNegotiate and useExecute hooks pass `selectedBaseUrl` from AppState to the API client.

## Performance

- **Duration:** ~5 minutes
- **Completed:** 2026-05-08
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- ProviderCard displays `service.base_url` in muted gray below feature count, with `truncate` for long URLs
- ProviderSelector shows inline base_url override input when a provider is selected, with placeholder from card data, reset button, and helper text
- Switching providers clears the base_url override to avoid stale overrides
- useNegotiate reads `selectedBaseUrl` from AppState and passes it to `apiClient.negotiate()` as 3rd argument (or `undefined` when null)
- useExecute reads `selectedBaseUrl` from AppState and passes it as `baseUrl` in execute params (or `undefined` when null)
- Both hooks include `selectedBaseUrl` in their `useCallback` dependency arrays
- Gap 3 (base_url not displayed/configurable) is fully closed at the Playground UI level

## Task Commits

Each task was committed atomically:

1. **Task 1: Display base_url on ProviderCard and add override input in ProviderSelector** - `d8f5649` (feat)
2. **Task 2: Wire base_url override through negotiate and execute hooks** - `fa29d89` (feat)

## Files Created/Modified

- `apps/playground/src/components/ProviderCard.tsx` - Added `service.base_url` display row below feature count with "URL:" label and `truncate` class
- `apps/playground/src/components/ProviderSelector.tsx` - Destructures `selectedBaseUrl` from AppState; added inline base_url override input between header and card list with placeholder from card data, reset button, and helper text; clears override on provider switch
- `apps/playground/src/hooks/useNegotiate.ts` - Imports `useAppState`, reads `selectedBaseUrl`, passes to `apiClient.negotiate()` call, added to `useCallback` deps
- `apps/playground/src/hooks/useExecute.ts` - Imports `useAppState`, reads `selectedBaseUrl`, passes as `baseUrl` in execute params, added to `useCallback` deps

## Decisions Made

- Switching providers clears the base_url override (SET_BASE_URL null) to prevent stale overrides from a previous provider being applied to a different provider
- When `selectedBaseUrl` is null, `undefined` is passed to the API client -- the API falls back to the default URL from the provider-card.json, matching the data layer contract from Plan 03-06
- Reset button (X SVG icon) is only rendered when a non-null override exists, keeping the UI clean at default state

## Deviations from Plan

None - plan executed exactly as written. Every change matched the specification precisely. TypeScript compiled clean on first attempt for both tasks.

## Known Stubs

No new stubs created. Pre-existing stubs from prior plans remain:
- `isConfigured={true}` still hardcoded in ProviderSelector.tsx (API key status not yet available)
- `+ Add` button has no onClick handler (Add Pack dialog integration deferred)

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| threat_flag: none | ProviderCard.tsx | base_url values from provider-card.json are public configuration data. No secrets exposed. |
| threat_flag: none | ProviderSelector.tsx | base_url input is developer-entered text for a local tool. Accept disposition per T-03-11. |
| threat_flag: none | useNegotiate.ts, useExecute.ts | selectedBaseUrl passed as undefined when null -- no security boundary crossed. |

No new threat surface beyond what was modeled in the plan's threat register.

## Key Links

| From | To | Via |
|------|----|-----|
| ProviderCard.tsx service.base_url display | ProviderCard.service data | `card.service?.base_url` conditional render |
| ProviderSelector.tsx base_url input | context.ts SET_BASE_URL | `dispatch({ type: "SET_BASE_URL", baseUrl: val || null })` |
| ProviderSelector.tsx handleSelect | context.ts SET_BASE_URL | Clear override on provider switch |
| useNegotiate.ts | api.ts negotiate() | `selectedBaseUrl ?? undefined` as 3rd arg |
| useExecute.ts | api.ts execute() | `baseUrl: selectedBaseUrl ?? undefined` in params |
| Plan 03-07 | Plan 03-06 | Consumes selectedBaseUrl state and baseUrl API params |

## Success Criteria

- [x] ProviderCard displays `service.base_url` below the feature count
- [x] ProviderSelector shows inline base_url override input when a provider is selected
- [x] base_url input has placeholder showing the provider's default URL from card data
- [x] Reset button clears the override back to default
- [x] Selecting a different provider clears the base_url override
- [x] useNegotiate reads `selectedBaseUrl` and passes it to apiClient.negotiate()
- [x] useExecute reads `selectedBaseUrl` and passes it to apiClient.execute()
- [x] TypeScript compiles clean (PASS)
- [x] Existing 5 tests pass (no regressions)
- [x] Gap 3 (base_url not displayed/configurable) is fully closed

## Self-Check: PASSED

- [x] `apps/playground/src/components/ProviderCard.tsx` -- `card.service?.base_url` found (1 match)
- [x] `apps/playground/src/components/ProviderCard.tsx` -- `URL:` label found (1 match)
- [x] `apps/playground/src/components/ProviderSelector.tsx` -- `selectedBaseUrl` found (3 matches)
- [x] `apps/playground/src/components/ProviderSelector.tsx` -- `SET_BASE_URL` found (3 matches)
- [x] `apps/playground/src/components/ProviderSelector.tsx` -- "Override the default base URL" found (1 match)
- [x] `apps/playground/src/hooks/useNegotiate.ts` -- `useAppState` imported and used (2 matches)
- [x] `apps/playground/src/hooks/useNegotiate.ts` -- `selectedBaseUrl` referenced (3 matches)
- [x] `apps/playground/src/hooks/useExecute.ts` -- `useAppState` imported and used (2 matches)
- [x] `apps/playground/src/hooks/useExecute.ts` -- `selectedBaseUrl` referenced (3 matches)
- [x] `apps/playground/src/hooks/useExecute.ts` -- `baseUrl: selectedBaseUrl` found (1 match)
- [x] TypeScript compiles clean (tsc --noEmit exit 0)
- [x] Tests pass (5/5)
- [x] Each task committed individually: d8f5649, fa29d89
- [x] No accidental file deletions in commits
- [x] No untracked generated files left behind

---
*Phase: 03-playground-web-ui*
*Completed: 2026-05-08*
