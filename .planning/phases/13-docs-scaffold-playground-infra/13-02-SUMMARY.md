---
phase: 13
plan: 02
subsystem: playground
tags:
  - infra
  - proxy
  - vite
  - playground
dependency_graph:
  requires: []
  provides: [playground-via-proxy]
  affects: [playground-ui, api-server]
tech-stack:
  added: []
  patterns:
    - Vite proxy configuration for dev-time API routing
    - Relative path baseUrl for runtime portability
key-files:
  created: []
  modified:
    - apps/playground/src/lib/api.ts
    - apps/playground/vite.config.ts
decisions:
  - "API server routes are at root level (/providers, /negotiate, /execute), not under /api/* — added proxy rewrite to strip /api prefix"
metrics:
  duration: null
  completed_date: "2026-05-21"
---

# Phase 13 Plan 02: Vite Proxy Fix

Replace Playground's hardcoded `http://localhost:3000` with relative `/api` path and configure Vite proxy for dev-time forwarding.

## Objective

Replace Playground's hardcoded `http://localhost:3000` with relative `/api` path, and configure Vite proxy to forward `/api` requests to API Server (port 3000). Test files keep explicit `http://localhost:3000` unchanged (bypass proxy).

## Tasks

### Task 1: Change default baseUrl in api.ts

- **File modified**: `apps/playground/src/lib/api.ts` line 16
- **Change**: `createApiClient(config: ApiConfig = { baseUrl: "http://localhost:3000" })` becomes `createApiClient(config: ApiConfig = { baseUrl: "/api" })`
- **Verification**: No remaining `http://localhost:3000` in api.ts; test file `api.test.ts` unchanged with 4 explicit localhost references
- **Commit**: `fad66ac`

### Task 2: Add Vite proxy configuration

- **File modified**: `apps/playground/vite.config.ts`
- **Change**: Added `server.proxy` section forwarding `/api` to `http://localhost:3000` with `changeOrigin: true` and `rewrite` to strip `/api` prefix
- **Verification**: Tests pass (5/5), build succeeds, proxy/target/changeOrigin all in config
- **Deviation**: Added `rewrite` despite plan saying "do NOT rewrite" — required because API server routes are at root level, not under `/api/*`
- **Commit**: `61ca3a8`

## Deviations from Plan

### [Rule 1 - Bug] Added proxy rewrite for correct API routing

- **Trigger**: Plan's Task 2 specified "Do NOT rewrite path" with assertion that API server serves routes under `/api/*` prefix
- **Discovery**: Verified API server routes are all at root level (`/providers`, `/negotiate`, `/execute`, `/health`, `/vault/keys`) — none under `/api/*`
- **Fix**: Added `rewrite: (path) => path.replace(/^\/api/, "")` to the proxy config. Without this, proxied requests to `/api/providers` would be forwarded as `http://localhost:3000/api/providers` which matches no route, returning 404.
- **Files modified**: `apps/playground/vite.config.ts`
- **Commit**: `61ca3a8`

## Verification Criteria

| Criteria | Result |
|----------|--------|
| Tests pass (5/5) | Passed |
| Build succeeds | Passed |
| No hardcoded localhost:3000 in api.ts | Passed |
| Test file unchanged with explicit localhost:3000 | Passed |
| Proxy config present in vite.config.ts | Passed |
| target `http://localhost:3000` in proxy | Passed |
| `changeOrigin: true` in proxy | Passed |

Note: Dev proxy availability verification (`curl http://localhost:5173/api/providers`) requires running dev servers and is not testable in CI/non-interactive mode.

## Success Criteria

All execution criteria met. Two tasks completed, both committed individually.

## Self-Check: PASSED

- [x] `apps/playground/src/lib/api.ts` contains `baseUrl: "/api"` as default
- [x] `apps/playground/src/lib/api.ts` has no `http://localhost:3000` remaining
- [x] `apps/playground/src/lib/api.test.ts` still has 4 explicit `http://localhost:3000` references
- [x] `apps/playground/vite.config.ts` has proxy config with `"/api"` match path
- [x] `apps/playground/vite.config.ts` has `target: "http://localhost:3000"`
- [x] Tests pass: 5/5
- [x] Build succeeds
- [x] Commits exist: `fad66ac`, `61ca3a8`
