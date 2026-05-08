---
phase: 04-provider-smoke-tests
plan: 01
type: execute
subsystem: cli
tags: [smoke-test, openai, replicate, connector, vault]
requires: [03-01, 03-02, 03-03, 03-04, 03-05, 03-06, 03-07]
provides: [synapse-smoke-command]
affects: [apps/cli/src/index.ts]
tech-stack:
  added:
    - none
  patterns:
    - "CLI command: handleXCommand + parseXArgs + printXHelp + formatXOutput"
    - "Build ConnectLock inline from provider-card.json (bypass negotiate)"
    - "API key resolution: vault.getKey() with --api-key fallback"
key-files:
  created:
    - apps/cli/src/commands/smoke.ts
  modified:
    - apps/cli/src/index.ts
decisions:
  - "Use connector.connect() layer -- smoke tests exercise same code path as production synapse connect"
  - "One runSmokeTest function per provider (runOpenAiSmoke, runReplicateSmoke)"
  - "--provider is required -- prevents accidental API calls"
  - "Build ConnectLock inline from provider card, bypassing negotiate/getOrCreateLock"
  - "Replicate: check id and status fields (not output) since predictions API is async"
  - "API key redaction via maskApiKey() applied in all error handlers"
  - "WithTimeout wrapper via Promise.race (connector does not accept AbortSignal)"
  - "SKIP (not FAIL) when API key is missing"
metrics:
  duration_seconds: 579
  files_created: 1
  files_modified: 1
  lines_added: 489
  completed_date: "2026-05-08"
---

# Phase 04 Plan 01: Provider Smoke Tests -- Summary

**One-liner:** `synapse smoke --provider <name>` CLI command that runs automated connectivity smoke tests against real OpenAI and Replicate production APIs through the existing `@synapse-router/connector` layer, with structured PASS/SKIP/FAIL output in json/table/compact formats and automatic API key redaction.

## Execution Summary

2 tasks executed, both `type="auto"`. No checkpoints in this plan.

### Task 1: Create `apps/cli/src/commands/smoke.ts`

Created the complete smoke test framework as a single file (469 lines, 10 functions):

- **6 exported functions:** `handleSmokeCommand`, `parseSmokeArgs`, `printSmokeHelp`, `formatSmokeOutput`, `runOpenAiSmoke`, `runReplicateSmoke`
- **4 internal helpers:** `maskApiKey`, `withTimeout`, `loadProviderCard`, `findPacksDir`
- **Type definitions:** `SmokeOptions`, `SmokeResult`, `ProviderCard`
- **OpenAI smoke test:** Sends `{ prompt: [{role:"user", content:"Hello"}], model: "gpt-4o-mini" }` via `connector.connect()`, verifies `choices[0].message.content` is present
- **Replicate smoke test:** Sends `{ model_version: "stability-ai/sdxl:39ed52f2...", input: { prompt: "..." } }` via `connector.connect()`, verifies `id` and `status` fields in response (async predictions API)
- **3 output formats:** `json` (full array), `table` (columnar with Status/Provider/Latency/Detail), `compact` (one-liner per provider)
- **API key resolution:** vault first, `--api-key` flag fallback
- **SKIP behavior:** when no API key available, prints SKIP result (not a failure)
- **API key redaction:** `maskApiKey()` applied to all error handlers (6 calls total), per threat model T-04-01/02/03
- **Timeout:** `withTimeout()` via Promise.race (configurable `--timeout`, default 30s)

### Task 2: Wire smoke command into `apps/cli/src/index.ts`

Four single-point insertions:

1. **Import** (line 11): `import { handleSmokeCommand, printSmokeHelp } from "./commands/smoke.js";`
2. **Help text** (line 102): `smoke --provider <name>       Run provider smoke tests against live APIs`
3. **Help subcommand handler** (line 767): `case "smoke": printSmokeHelp(); return;`
4. **Main command dispatch** (line 864-871): `case "smoke":` block calling `handleSmokeCommand(rawArgs)`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type assertion errors**
- **Found during:** Task 1 verification (build step)
- **Issue:** TypeScript strict mode rejects `err as { status: ... }` because `Error` type does not sufficiently overlap with the cast target type
- **Fix:** Added `unknown` intermediate cast: `err as unknown as { status: ... }`
- **Files modified:** `apps/cli/src/commands/smoke.ts` (lines 184, 282)
- **Commit:** 5b60d1d

## Verification Results

| # | Check | Result |
|---|-------|--------|
| 1 | File existence (smoke.ts) | PASS |
| 2 | All 4 exported functions present | PASS |
| 3 | runOpenAiSmoke and runReplicateSmoke present | PASS |
| 4 | All 4 internal helpers present | PASS |
| 5 | maskApiKey called >= 3 times | PASS (6 calls) |
| 6 | CLI import present in index.ts | PASS |
| 7 | 2 case "smoke": blocks in index.ts | PASS |
| 8 | Help text in printHelp() | PASS |
| 9 | `pnpm build` succeeds | PASS |
| 10 | `synapse smoke --help` works | PASS |
| 11 | `--provider` required enforced | PASS |
| 12 | SKIP on missing API key (exit 0) | PASS |
| 13 | JSON format SKIP output correct | PASS |

## Decisions Made

| Decision | Outcome |
|----------|---------|
| D-01 | Use connector.connect() layer -- smoke tests exercise same code path as production synapse connect |
| D-02 | Framework lives in apps/cli/src/commands/smoke.ts -- consistent with other CLI commands |
| D-03 | One runSmokeTest function per provider (runOpenAiSmoke, runReplicateSmoke) |
| D-04 | --provider is required -- synapse smoke without --provider errors and exits 1 |
| D-05 | Supported flags: --provider, --timeout (default 30s), --format (json/table/compact), --verbose/-v |
| D-06 | OpenAI: gpt-4o-mini, basic Hello message, verify choices[0].message.content |
| D-07 | Replicate: hardcoded SDXL model version, fixed input prompt |
| D-08 | Verify response shape beyond HTTP 200 (OpenAI: content; Replicate: id+status) |

## Known Stubs

None. The smoke command is fully wired with all functionality implemented.

## Threat Flags

None. All security-relevant surface introduced (API key handling, stdout output) is addressed by the threat model mitigations: `maskApiKey()` redaction is applied in all error paths, and the `formatSmokeOutput` function receives pre-sanitized `SmokeResult.detail` strings.

## Commits

| Commit | Description |
|--------|-------------|
| `5b60d1d` | feat(04-provider-smoke-tests): create synapse smoke CLI command with OpenAI and Replicate smoke tests |
| `ba497b0` | feat(04-provider-smoke-tests): wire smoke command into CLI dispatch, help text, and help subcommand |

## Self-Check: PASSED

- [x] `apps/cli/src/commands/smoke.ts` exists (confirmed via git)
- [x] `apps/cli/src/index.ts` has smoke import + 2 case blocks + help text (confirmed via grep)
- [x] Commit `5b60d1d` exists (confirmed via git log)
- [x] Commit `ba497b0` exists (confirmed via git log)
- [x] Build passes (confirmed via `pnpm build`)
- [x] CLI help works (confirmed via `node dist/index.js smoke --help`)
- [x] SKIP behavior works (confirmed via `node dist/index.js smoke --provider openai`)
- [x] `--provider` required enforced (confirmed via `node dist/index.js smoke 2>&1 | grep "Error: --provider is required"`)
