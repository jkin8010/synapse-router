---
phase: 18-interactive-negotiation
plan: 03
subsystem: cli
tags: negotiate, interactive, lock, sigint, prompts

requires:
  - phase: 18-interactive-negotiation
    plan: 02
    provides: negotiateAndVerify pipeline, result display

provides:
  - Lock diff preview before save (showLockDiffPreview)
  - Post-negotiation 5-option routing menu (promptRoutingMenu)
  - SIGINT/SIGTERM graceful exit with cleanup
  - Prompt tier classification annotations
  - Non-interactive mode preservation verification

affects:
  - 18-interactive-negotiation verification
  - 19-connect-integration (routing menu connect option)

tech-stack:
  added: none
  patterns:
    - lock diff comparison before schema save
    - signal handler registration/cleanup within interactive function
    - prompt tier annotation convention (required/recommended/contextual/confirmation)
    - ExitPromptError catch for @inquirer Ctrl+C handling

key-files:
  created: none
  modified:
    - apps/cli/src/commands/negotiate.ts

key-decisions:
  - Lock diff compares existing lock input_schema.fields vs negotiation result schema.fields
  - Routing menu is non-looping: one selection then returns
  - Playground browser open uses execSync with platform detection, hardcoded localhost:5173
  - SIGINT double-trigger prevention via interrupted flag
  - Non-interactive mode verified by confirming no changes to `--intent X --provider Y` code path

patterns-established:
  - Prompt tier annotation: comments before each prompt call with format `// Tier: <level> -- <reason>`
  - Signal handler lifecycle: registered at function start, removed at function end

requirements-completed:
  - NEGO-06: Lock diff preview before save
  - NEGO-07: Post-negotiation routing menu
  - NEGO-08: Non-interactive mode preservation
  - NEGO-09: SIGINT/SIGTERM graceful exit
  - NEGO-10: Prompt tier classification

duration: 5min
completed: 2026-05-25
---

# Phase 18-03: Interactive Negotiation Completion Summary

**Lock diff preview, post-negotiation routing menu, SIGINT handling, prompt tier classification, non-interactive mode preservation**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-25T17:16:00+08:00
- **Completed:** 2026-05-25T17:21:39+08:00
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- **Lock diff preview** (`showLockDiffPreview`): Before saving a Schema Lock, compares existing lock (if any) with the new negotiation result. Shows added fields (green), removed fields (red), or "no field changes" when identical. For first-time locks, displays "First Schema Lock" message.
- **Post-negotiation routing menu** (`promptRoutingMenu`): 5 options - Test connection (synapse connect), Generate SDK (synapse evolve), Show SDK integration code, Open Playground (auto-opens browser), Save and exit. Each displays ready-to-run commands.
- **SIGINT/SIGTERM handling**: Cleanup handler registered at function start, removed at end. Double-trigger prevention via `interrupted` flag. `ExitPromptError` from @inquirer/prompts caught and routed to cleanup. Exit code 130.
- **Prompt tier annotations**: All 5 prompt sites annotated: required (intent, provider), recommended (field selection), contextual (LLM key warning), confirmation (lock save, routing menu).
- **Non-interactive mode preservation**: Verified that `--intent X --provider Y` code path is untouched. All 4 existing negotiate tests pass.

## Task Commits

1. **Tasks 1+2+3: Lock diff preview + routing menu + SIGINT handling + tier annotations** - `885fd50` (feat)

## Files Created/Modified

- `apps/cli/src/commands/negotiate.ts` - Added `showLockDiffPreview()`, `promptRoutingMenu()`, SIGINT/SIGTERM handler, tier annotations, lock save confirmation, routing menu wiring

## Decisions Made

- Lock diff uses `input_schema.fields` from existing `SchemaLock` vs `result.schema.fields` from `NegotiationResult` for field comparison
- Routing menu is single-selection (non-looping) by design - the 5 options are immediate actions, not a persistent menu
- Playground URL hardcoded to `http://localhost:5173`, consistent with development server convention
- `ExitPromptError` name-based detection used for @inquirer compatibility (not instanceof, which is brittle across dynamic imports)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Interactive negotiation flow complete through Step 12 (post-negotiation routing menu)
- All NEGO requirements (06-10) completed
- Ready for 19-connect-integration which can consume the routing menu's "connect" action
- Playground option ready for when Playground server is implemented

---

*Phase: 18-interactive-negotiation (Plan 03)*
*Completed: 2026-05-25*
