---
phase: 17-cli-infrastructure
plan: 03
subsystem: cli
tags: [cli, infrastructure, setup, billing, prompts, refactor]
requires: [17-01]
provides: [setup-uses-shared-prompts, billing-init-uses-shared-prompts]
affects: [setup.ts, billing.ts]
key-decisions:
  - "All prompt input/business logic defaults preserved from existing readline implementation"
  - "setup.ts promptSelect returns numeric index (same behavior as old implementation)"
  - "billing.ts config and status subcommands untouched (no interactive prompts)"
  - "configureProviderInteractive no longer takes question callback parameter"
metrics:
  duration: 12m
  completed: 2026-05-25
  tasks: 2
  files_modified: 2
  commits: 2
---

# Phase 17 Plan 03: Migrate Existing Commands to Shared Prompts

Refactor setup.ts and billing.ts init to use shared @inquirer/prompts wrappers from utils/prompts.ts. Eliminates ~150 lines of duplicated readline prompt code.

## Commit History

| Commit | Description |
|--------|-------------|
| 2aca7cf | feat(17-cli-infrastructure-03): refactor setup.ts to use shared prompts |
| c980a04 | feat(17-cli-infrastructure-03): refactor billing.ts init wizard to use shared prompts |

## Files Modified

- `apps/cli/src/commands/setup.ts` -- Removed 2 readline-based prompt functions (58 lines), added imports + 4 prompt replacements using promptSelect/promptInput/promptPassword
- `apps/cli/src/commands/billing.ts` -- Removed createPrompter() (7 lines), replaced question() calls in configureProviderInteractive() with promptSelect/promptInput, replaced interactive provider selection in handleBillingInit() with promptSelect

## Deviations from Plan

None -- plan executed exactly as written.

## Task Summary

### Task 1: Refactor setup.ts to use shared prompts.ts

- Removed `node:readline` dynamic import, `prompt()` function, and `promptSelect()` function (lines 64-121)
- Added `import { promptSelect, promptInput, promptPassword } from "../utils/prompts.js"`
- Replaced `promptSelect("Step 1: Choose a provider", allOptions)` with `promptSelect<number>(...)` mapping string labels to numeric indices
- Replaced `prompt("  Provider ID: ")` and `prompt("  Provider name: ")` with `promptInput()`
- Replaced hidden `prompt(..., true)` for API key with `promptPassword()`
- Replaced base URL `prompt(...)` with `promptInput()` using `{ defaultVal: defaultBaseUrl }`
- Replaced all remaining `promptSelect()` calls with `promptSelect<number>(...)` with option mapping

### Task 2: Refactor billing.ts init wizard to use shared prompts.ts

- Removed `createPrompter()` function that used `node:readline`
- Added `import { promptSelect, promptInput, promptConfirm }` and `import type { SelectOption }`
- Changed `configureProviderInteractive()` signature: removed `question` callback parameter
- Replaced "Accept? [Y/n/custom]:" text prompt with `promptSelect` for pricing actions (accept/custom/skip)
- Replaced custom pricing text prompts with `promptInput` with validate and defaultVal
- Replaced quota/period/onError text prompts with `promptInput` with defaults
- Replaced interactive provider selection (numbered list + text input) with `promptSelect<number>` using SelectOption mapping
- `handleBillingConfig()`, `handleBillingStatus()`, `configureProviderNonInteractive()` -- completely unchanged

## Verification Results

| Check | Result |
|-------|--------|
| `grep "node:readline" setup.ts` | PASS: no match (fully removed) |
| `grep "node:readline" billing.ts` | PASS: no match (fully removed) |
| `grep "createPrompter\|rl.question" billing.ts` | PASS: no match (fully removed) |
| `grep "from.*utils/prompts" setup.ts` | PASS: imports promptSelect, promptInput, promptPassword |
| `grep "from.*utils/prompts" billing.ts` | PASS: imports promptSelect, promptInput, promptConfirm |
| `npx tsc -p apps/cli/tsconfig.json --noEmit` | PASS: exit code 0 |
| `pnpm test` (CLI, 23 tests) | PASS: 23/23 pass, 0 fail |
| billing.ts config subcommand unchanged | PASS: handleBillingConfig function still present |
| billing.ts status subcommand unchanged | PASS: handleBillingStatus function still present |

## Self-Check: PASSED

All claims verified. Setup wizard has same 4-step flow. Billing init wizard has same feature-by-feature configuration with same pricing strategies and quota config.
