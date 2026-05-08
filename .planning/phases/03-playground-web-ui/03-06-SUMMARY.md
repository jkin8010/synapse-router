---
phase: 03-playground-web-ui
plan: 06
type: execute
subsystem: playground
tags: [gap-closure, base-url, api-contract, data-layer, state-management]
wave: 4
dependency_graph:
  requires: ["01", "03"]
  provides: ["07"]
  affects: [apps/api, apps/playground]
tech_stack:
  added: []
  patterns:
    - "base_url override piped through API request body (NegotiateBody/ExecuteBody)"
    - "service field exposed from ProviderCard in GET /providers response"
    - "selectedBaseUrl in AppState with SET_BASE_URL reducer action"
    - "API client negotiate/execute parameter spreading for optional base_url"
key_files:
  created: []
  modified:
    - apps/api/src/index.ts
    - apps/playground/src/context.ts
    - apps/playground/src/lib/api.ts
    - apps/playground/src/hooks/useNegotiate.ts
  deleted: []
decisions:
  - "base_url override in NegotiateBody/ExecuteBody is optional (never required)"
  - "provider_base_url_override is conditionally included in negotiate response (only when override sent)"
  - "service object in GET /providers exposes only id, name, base_url, auth_type (not version or api_version)"
  - "useNegotiate.ts updated with undefined placeholder for baseUrl -- full wiring deferred to Plan 07"
metrics:
  duration: "~8 minutes"
  files_created: 0
  files_modified: 4
  files_deleted: 0
  typecheck_api: PASS
  typecheck_playground: PASS
  tests_playground: 5/5 PASS
  completed_date: "2026-05-08"
---

# Phase 3 Plan 6: base_url API Contract + Data Layer -- Summary

## One-liner

API server exposes `service.base_url` in GET /providers and accepts `base_url` override in negotiate/execute, while Playground context and API client are extended to carry base_url through the data pipeline from provider card data to API request payload.

## Tasks Executed

### Task 1: Add service.base_url to API responses and accept base_url override in negotiate/execute (7ead357)

**Modified `apps/api/src/index.ts` with 5 changes:**

1. **NegotiateBody**: Added optional `base_url?: string` field -- API now accepts `base_url` from Playground negotiate requests.

2. **ExecuteBody**: Added optional `base_url?: string` field -- API now accepts `base_url` from Playground execute requests.

3. **GET /providers response**: Added `service` object with `id`, `name`, `base_url`, `auth_type` to the provider listing. Previously only `provider`, `source`, and `features` were returned. The `entry.card.service` data was already available but not exposed.

4. **POST /negotiate response**: Conditionally includes `provider_base_url_override` field when the request body contains a `base_url` override. This signals back to the Playground that the override was accepted.

5. **POST /execute handler**: Changed `provider_base_url` from always using `entry.card.service.base_url` to `body.base_url ?? entry.card.service.base_url` -- respects the user's override when provided, falls back to the default from the provider card.

### Task 2: Extend Playground ProviderCard type, AppState, and API client for base_url support (c6ec2eb)

**Modified `apps/playground/src/context.ts` with 5 changes:**

1. **ProviderCard interface**: Extended with optional `source?: string` and `service?: { id, name, base_url, auth_type }` fields. The `service` type mirrors the shape from the API's GET /providers response.

2. **AppState interface**: Added `selectedBaseUrl: string | null` field -- stores the user's currently selected base_url override.

3. **initialState**: Added `selectedBaseUrl: null` -- starts with no override.

4. **AppAction type**: Added `| { type: "SET_BASE_URL"; baseUrl: string | null }` action for the reducer.

5. **appReducer**: Added `SET_BASE_URL` case that returns `{ ...state, selectedBaseUrl: action.baseUrl }`.

**Modified `apps/playground/src/lib/api.ts` with 3 changes:**

6. **negotiate()**: Added `baseUrl?: string` parameter (position 3, after `providerId`), spreads `base_url: baseUrl` into request body when provided.

7. **execute() params type**: Added `baseUrl?: string` to the params object, spreads `base_url: params.baseUrl` into request body when provided.

8. **execute() body construction**: Changed from `JSON.stringify(params)` (which sent all params as-is) to explicit field spreading -- sends only `negotiation_id`, `provider_id`, `input`, and conditionally `base_url`. This is required because `baseUrl` is a camelCase client param that must be sent as `base_url` (snake_case API contract).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] useNegotiate.ts type error from signature change**
- **Found during:** Task 2 typecheck verification
- **Issue:** The `negotiate()` function signature changed from `(schema, providerId?, signal?)` to `(schema, providerId?, baseUrl?, signal?)`, making `controller.signal` passed as 3rd argument a type error (AbortSignal not assignable to string).
- **Fix:** Changed call in `useNegotiate.ts` to pass `undefined` as the 3rd argument (baseUrl placeholder) and `controller.signal` as 4th argument (signal).
- **Files modified:** `apps/playground/src/hooks/useNegotiate.ts`
- **Commit:** c6ec2eb

## Pre-existing Issues Found

**API test "POST with invalid JSON returns 400" fails on current codebase (19/20 pass):**
- The test sends invalid JSON to POST /health endpoint, but there is no POST /health route handler, so the server returns 404 before parseBody is ever called. This test failure is pre-existing and unrelated to this plan's changes.

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| threat_flag: none | apps/api/src/index.ts | base_url override in NegotiateBody/ExecuteBody is optional, user-controlled input accepted as-is from development tool. Provider validation occurs before base_url is used (via provider_id lookup in the provider registry). Accept disposition per T-03-08. |
| threat_flag: none | apps/playground/src/lib/api.ts | baseUrl parameter conditionally spread into JSON body. No validation needed -- it is a UI toggle value. Accept disposition per T-03-09. |
| threat_flag: none | apps/playground/src/context.ts | ProviderCard.service and selectedBaseUrl state -- no security implications. |

No new threat surface beyond what was modeled in the plan's threat register.

## Key Links

| From | To | Via |
|------|----|-----|
| GET /providers response | packs/*/provider-card.json | `entry.card.service` -- service data now exposed in response |
| POST /negotiate NegotiateBody.base_url | Playground api.ts negotiate() | `base_url` in JSON body |
| POST /execute ExecuteBody.base_url | Playground api.ts execute() | `base_url` in JSON body |
| Playground context.ts ProviderCard.service | GET /providers response | `service` field in API response |
| Playground context.ts selectedBaseUrl | API `base_url` payload | SET_BASE_URL dispatch => API request body |
| useNegotiate.ts | api.ts negotiate() | `undefined` placeholder for baseUrl (wired in Plan 07) |

## Success Criteria

- [x] GET /providers response includes `service: { id, name, base_url, auth_type }` for each provider
- [x] NegotiateBody and ExecuteBody accept optional `base_url` field
- [x] POST /negotiate response includes `provider_base_url_override` when base_url is sent in request
- [x] POST /execute uses `body.base_url ?? entry.card.service.base_url` for `provider_base_url`
- [x] Playground ProviderCard type includes optional `service` with `base_url`
- [x] AppState includes `selectedBaseUrl` with `SET_BASE_URL` action
- [x] Playground API client sends `base_url` in negotiate/execute request body when provided
- [x] API server typecheck: PASS
- [x] Playground typecheck: PASS
- [x] Playground tests: 5/5 PASS
- [x] Gap 3 data pipeline (API server -> Playground state -> API request payload) established

## Self-Check: PASSED

- [x] `apps/api/src/index.ts` -- `base_url?: string` in NegotiateBody AND ExecuteBody (2 matches)
- [x] `apps/api/src/index.ts` -- `service:` block in GET /providers response with `base_url: entry.card.service.base_url`
- [x] `apps/api/src/index.ts` -- `body.base_url ?? entry.card.service.base_url` in POST /execute
- [x] `apps/api/src/index.ts` -- `provider_base_url_override` conditionally in POST /negotiate response
- [x] `apps/playground/src/context.ts` -- `service?: { ... base_url ... }` in ProviderCard
- [x] `apps/playground/src/context.ts` -- `selectedBaseUrl` in AppState, initialState, and reducer (3 occurrences)
- [x] `apps/playground/src/context.ts` -- `SET_BASE_URL` action type and reducer case
- [x] `apps/playground/src/lib/api.ts` -- `negotiate()` accepts `baseUrl?: string`, spreads `base_url: baseUrl` in body
- [x] `apps/playground/src/lib/api.ts` -- `execute()` params includes `baseUrl?: string`, spreads `base_url: params.baseUrl` in body
- [x] `apps/playground/src/hooks/useNegotiate.ts` -- fixed to pass `undefined` for new baseUrl parameter position
- [x] TypeScript compiles clean (both API server and Playground package)
- [x] Playground tests pass (5/5)
- [x] Each task committed individually with descriptive message
- [x] Plan commits: 7ead357, c6ec2eb
