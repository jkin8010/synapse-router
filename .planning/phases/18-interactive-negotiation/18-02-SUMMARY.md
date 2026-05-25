---
phase: 18-interactive-negotiation
plan: 02
subsystem: cli
tags: interactive, prompts, negotiate, schema-display, field-selection, llm-key, vault

requires:
  - phase: 18-01
    provides: Interactive mode entry, intent/ provider selection, runInteractiveNegotiation scaffold

provides:
  - Schema field display with picocolors (required=green, optional=yellow)
  - Optional field checkbox toggling (required fields locked)
  - LLM API key detection from vault/env/config
  - Stub warning banner when no LLM key configured
  - negotiateAndVerify pipeline integration with user's selected fields

affects:
  - 18-03 (post-negotiation routing menu)

tech-stack:
  added: []
  patterns:
    - Schema display helper using picocolors for field-level coloring
    - Field checkbox choices with disabled required fields
    - Tiered LLM key detection (vault -> env -> config)
    - Stub detection via heuristic field signature

key-files:
  modified:
    - apps/cli/src/commands/negotiate.ts
    - apps/cli/src/utils/prompts.ts

key-decisions:
  - "promptCheckbox modified to preserve `checked` from choice objects when `defaults` not provided, enabling per-choice initial state without changing the public API"
  - "displayFeatureSchema uses module-level pc import rather than parameter (simpler, matches existing pattern)"
  - "Stub detection checks llmApiKey first, then field signature (1 field, name=input, type=string) — avoids false positive when real LLM happens to produce single-field schema"
  - "ContractVerificationError handling mirrors non-interactive path exactly for consistent UI"

requirements-completed: [NEGO-02, NEGO-03, NEGO-04, NEGO-05]

duration: 14min
completed: 2026-05-25
---

# Phase 18: Plan 02 - Interactive Schema Display and Negotiation Pipeline

**Schema field display with colored required/optional markers, optional field checkbox toggling with locked required fields, LLM API key detection from vault/env/config with stub warning, and full negotiateAndVerify integration with user-selected field constraints**

## Performance

- **Duration:** 14 min
- **Started:** 2026-05-25T09:09:14Z
- **Completed:** 2026-05-25T09:23:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `displayFeatureSchema()` shows input/output fields with picocolors: required fields in green with `[required]` marker, optional fields in yellow with `[optional]` marker, enum values and type annotations included
- `buildFieldChoices()` constructs checkbox choices from feature input fields — required fields are `disabled: true` (cannot uncheck) and pre-checked, all fields start selected
- `promptFieldSelection()` orchestrates schema table display followed by checkbox prompt for optional field deselection
- LLM key auto-detected from three sources in priority: vault key `negotiator-llm` > `OPENAI_API_KEY` env var > config `negotiator.apiKey`
- When no LLM key found: yellow warning banner with configuration guidance (`synapse vault set negotiator-llm <key>` / `export OPENAI_API_KEY`) and confirm/cancel prompt
- `NegotiateAndVerifyInput` built with user's `selectedFields` as constraints, plus optional `llmOptions` with model/baseUrl from config
- `negotiateAndVerify` call wrapped in try/catch — `ContractVerificationError` displays structured details (status, missing/extra/type_mismatch, mock error, retries, suggestions); other errors display message inline
- `displayNegotiationResultDetails()` renders 5-section output (Provider Feature, Negotiated Schema, Manifest Match, Field Mappings, Example I/O) matching non-interactive format with `pc.bold(pc.cyan(...))` section headers
- Stub detection after successful negotiation: if no LLM key was configured AND schema matches 1-field `input:string` signature, a yellow `⚠` warning banner explains the generic placeholder

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema display and field checkbox toggling** - `629f69b` (feat)
   - `displayFeatureSchema()`, `buildFieldChoices()`, `promptFieldSelection()` helpers
   - `promptCheckbox` modification to preserve `checked` from choice objects
   - Step 6 integration in `runInteractiveNegotiation`

2. **Task 2: LLM key detection, stub warning, and negotiateAndVerify integration** - `0fcbb88` (feat)
   - LLM key detection from vault -> env -> config
   - No-key warning banner with confirm/cancel
   - negotiateAndVerify pipeline with user-selected fields
   - ContractVerificationError structured error display
   - `displayNegotiationResultDetails()` 5-section output
   - Stub signature post-hoc detection banner

**Plan metadata:** (to be committed after STATE.md update)

## Files Modified

- `apps/cli/src/utils/prompts.ts` - Modified `promptCheckbox` to preserve `checked` from individual choice objects when `defaults` not provided, enabling per-choice initial checked state
- `apps/cli/src/commands/negotiate.ts` - Added `displayFeatureSchema()`, `buildFieldChoices()`, `promptFieldSelection()`, `displayNegotiationResultDetails()` helpers, extended `runInteractiveNegotiation()` with Steps 6-10

## Decisions Made

- **promptCheckbox API backwards compatibility:** Modified `promptCheckbox` to only overwrite `checked` when `defaults` is explicitly provided. When no defaults, it preserves `checked` from each individual choice object. This maintains existing behavior for all current callers (none use `checked` on individual choices today) while enabling the new field selection flow.
- **Stub warning uses `llmApiKey` guard + schema heuristic:** The stub detection checks `!llmApiKey` first, THEN the 1-field `input:string` signature. This prevents false positives if the user does have a key configured but the LLM happens to produce a single-field schema (extremely unlikely for real negotiation).
- **displayNegotiationResultDetails uses module-level `pc`:** Rather than passing `pc` as a parameter per the plan sketch, it uses `pc` from module scope — simpler and consistent with how all other functions in the file use it.
- **ContractVerificationError handling mirrors non-interactive path:** The error display code directly matches lines 519-546 of the non-interactive path, ensuring consistent user experience regardless of mode.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Threat Flags

No new threat flags introduced. Per the plan's threat model:
- T-18-05 (Information Disclosure): API key passed only to LLM client constructor, never logged. Code uses `createVault().getKey("negotiator-llm")` matching existing non-interactive pattern.
- T-18-06 (Spoofing): Accepted — stub detection heuristic with `llmApiKey` guard prevents false positives.
- T-18-07 (Elevation of Privilege): Accepted — user can only toggle optional fields, required fields locked.
- T-18-08 (Tampering): Mitigated — vault key reading uses same AES-256-GCM path as non-interactive mode.

## Next Phase Readiness

- Phase 18-03 can begin: `runInteractiveNegotiation()` now ends after displaying negotiation results, with `selectedProvider`, `selectedIntent`, `selectedFields`, and `result` having been in scope. The next plan adds lock saving and a post-negotiation routing/connect menu.
- The interactive flow is fully functional end-to-end: intent selection -> provider selection -> schema review -> field toggling -> LLM key detection -> negotiation -> results display.
- Lock saving explicitly deferred to Plan 03 per plan spec.

---

## Self-Check: PASSED

- File `apps/cli/src/commands/negotiate.ts`: FOUND
- File `apps/cli/src/utils/prompts.ts`: FOUND
- Commit `629f69b` (Task 1): FOUND
- Commit `0fcbb88` (Task 2): FOUND
- No unintended file deletions detected
- All 23 CLI tests pass (including 4 negotiate tests)
- TypeScript compiles without errors

---
*Phase: 18-interactive-negotiation*
*Completed: 2026-05-25*
