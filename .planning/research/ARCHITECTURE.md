# Architecture Research: Interactive Negotiation

**Domain:** Multi-provider AI routing layer (interactive schema negotiation UX)
**Researched:** 2026-05-25
**Confidence:** HIGH (based on direct codebase reading across all affected packages)

## Current State

### How Negotiate Works Today

The negotiate flow is inline in `apps/cli/src/index.ts` (~300 lines at lines 678-986). It has two modes:

**Mode 1 -- Full pipeline** (`--intent <intent> --provider <provider>`):
1. Parse flags, load provider card from pack sources
2. Find matching feature by intent
3. Build `NegotiateAndVerifyInput` (task/goal/constraints from feature)
4. Read LLM API key from vault (key `negotiator-llm`)
5. Call `negotiateAndVerify()` from `@synapse-router/negotiator`, which:
   - `negotiateSchema()` -- LLM generates a schema from task/goal
   - `loadManifestFromPack()` -- read DSL constraints
   - `matchManifest()` -- field-level comparison (missing/extra/type_mismatch)
   - If mismatch: `retryWithFeedback()` -- LLM re-negotiates with structured feedback (max 2 retries)
   - `runMockTest()` -- generates sample request, tests against mock server
   - If mock fails: retry with feedback
   - `cacheVerificationResultLocally()` + fire-and-forget `submitVerification()`
6. Display full negotiation output (feature info, schema, manifest match, field mappings, example I/O)
7. Auto-save Schema Lock via `getOrCreateLock()`

**Mode 2 -- Legacy** (`<schema-file>`): Match features by intent from a local schema JSON file.

### Problems with Current Architecture

| Problem | Root Cause | Impact |
|---------|------------|--------|
| **No user oversight** | Full pipeline is automated with LLM. User has no chance to inspect, approve, or modify the schema. | Schema may not match user's actual needs. No trust. |
| **No schema editing** | After LLM generates schema, it goes straight to validation. No `addField`/`removeField`/`toggleRequired` capability. | User can't customize. Must re-run with different input. |
| **Implicit LLM dependency** | Without `negotiator-llm` key in vault, `createDefaultLLMClient()` falls back to a stub that returns `{input: string}`. User may not realize this. | Silent schema degradation. Confusing output. |
| **No post-negotiation routing** | After negotiation completes, user sees output and process exits with no "what next" guidance. | Low completion rate to connect or SDK generation. |
| **Monolithic inline code** | ~300 lines of negotiate logic lives inline in `apps/cli/src/index.ts`, mixed with provider/vault/help logic. | Hard to test, maintain, or extend with interactive features. |
| **Lock doesn't store agent schema** | `buildLockFromProviderCard()` captures only the provider's canonical schema. The negotiated/edited agent schema is lost after the command exits. | Can't revisit or share the negotiation result. |

## Target Architecture

### System Overview

```
                          CLI Entry (apps/cli/src/index.ts)
                                   │
                         ┌─────────┴─────────┐
                         │  case "negotiate"  │
                         └─────────┬─────────┘
                                   │
                         ┌─────────▼─────────┐
                         │  negotiate.ts     │  ← NEW: extracted from index.ts
                         │  (command handler) │      includes interactive flow
                         └─────────┬─────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
     ┌────────▼────────┐  ┌───────▼───────┐  ┌─────────▼─────────┐
     │  negotiateSchema │  │ matchManifest │  │  Post-Negotiation │
     │  (LLM generate)  │  │ (validate)    │  │  Routing          │
     └─────────────────┘  └───────────────┘  │  - connect         │
              │                    │           │  - sdk generate    │
              ▼                    ▼           │  - evolve          │
     ┌─────────────────┐  ┌───────────────┐   │  - save & exit     │
     │  Schema Editor  │  │ Lock Save     │   └───────────────────┘
     │  (interactive)  │  │ LockStorage   │
     └─────────────────┘  └───────────────┘
```

### Interactive Mode Data Flow

```
synapse negotiate --intent chat [--provider openai] [--interactive]
  │
  ├── 1. Parse args
  │     --interactive flag or missing critical args -> enter interactive
  │
  ├── 2. Provider Selection (if not specified)
  │     └── listAvailableProviders() -> promptSelectProvider()
  │
  ├── 3. Intent Selection (if not specified)
  │     └── findMatchingFeature() -> show features -> promptSelectIntent()
  │
  ├── 4. Schema Negotiation (LLM)
  │     ├── negotiateSchema({task, goal}) -> {schema, schema_id}
  │     ├── showFeatureInfo() -- provider's declared fields + required marks
  │     └── showNegotiatedSchema() -- LLM-proposed schema
  │
  ├── 5. [NEW] Interactive Schema Editing
  │     ├── LOOP:
  │     │   ├── showSchemaTable(schema) -- fields with type/required marks
  │     │   ├── promptEditAction() -> add/remove/toggle/validate/done
  │     │   ├── addField(name, type, required) -> add to schema
  │     │   ├── removeField(name) -> remove from schema
  │     │   ├── toggleRequired(name) -> flip required flag
  │     │   ├── validate() -> run matchManifest(), show mismatches
  │     │   └── done -> exit loop
  │     └── editedSchema, editedSchemaId (re-hash after edits)
  │
  ├── 6. Final Validation
  │     ├── loadManifestFromPack(packDir) -> constraints
  │     ├── matchManifest(editedSchema, mergedConstraints) -> result
  │     ├── if invalid: show buildSuggestions(), offer "edit again" or "force save"
  │     └── runMockTest(editedSchema, packDir, providerId) -> optional
  │
  ├── 7. Save Result
  │     ├── Save Schema Lock (from provider card, unchanged)
  │     └── [Optional] Save negotiation memo (negotiated schema + user edits)
  │
  └── 8. [NEW] Post-Negotiation Routing
        ├── Option A: "Test with connect"
        │     └── delegate to connect handler with provider/intent/lock
        ├── Option B: "Generate SDK"
        │     └── delegate to sdk generate or evolve
        ├── Option C: "Save negotiation memo"
        └── Option D: "Exit"
```

### Non-Interactive Mode (unchanged)

When `--interactive` is NOT specified, `synapse negotiate --intent X --provider Y` runs exactly the same fully automated pipeline it does today. The extracted `handleNegotiateCommand()` delegates to the same `negotiateAndVerify()` pipeline. Zero behavioral change.

## Component Boundaries

### Current State (no interactive negotiation)

| Package | Responsibility | Public API Used by Negotiate |
|---------|---------------|---------------------------|
| `@synapse-router/negotiator` | Schema negotiation + verification | `negotiateSchema()`, `negotiateAndVerify()`, `matchManifest()`, `loadManifestFromPack()`, `runMockTest()`, `buildSuggestions()` |
| `@synapse-router/lock` | Schema Lock caching | `getOrCreateLock()`, `LockStorage`, `buildLockFromProviderCard()` |
| `@synapse-router/vault` | API key storage | `createVault().getKey("negotiator-llm")` |
| `@synapse-router/connector` | Thin HTTP connection | Not used by negotiate (used by connect) |
| `@synapse-router/sdk-generator` | Code generation | Not directly used by negotiate (used by evolve/sdk) |
| `apps/cli` | CLI entry + all command handlers | `negotiate()` inline function at lines 678-986 |
| `@synapse-router/core` | Shared types | `Schema`, `ProviderCard`, `hashSchema()`, `normalizeSchema()`, `validateSchema()` |

### After Interactive Negotiation

| Package | What Changes | How |
|---------|-------------|-----|
| `@synapse-router/negotiator` | **+New exports** | `SchemaEditor` class for programmatic field manipulation; optionally `NegotiationMemo` types |
| `@synapse-router/lock` | **No change needed** | Existing `getOrCreateLock()` handles lock creation; interactive mode always passes `--no-cache` to force fresh lock |
| `apps/cli/src/index.ts` | **MODIFY** | Replace inline negotiate with import from `commands/negotiate.ts` |
| `apps/cli/src/commands/negotiate.ts` | **NEW** | Extracted negotiate handler + interactive flow + post-negotiation routing |
| `apps/cli/src/commands/connect.ts` | **MODIFY** | Add light integration: accept `--lock` flag to skip lock resolution when called from negotiate |
| `apps/cli/src/commands/sdk.ts` | **MODIFY** | Add light integration: accept provider/pack context from negotiate |
| `apps/cli/src/utils/prompt.ts` | **+New file** | Shared interactive prompt utilities (extracted from duplicate readline patterns in setup.ts, connect.ts, billing.ts) |

### Unchanged Files (Confirmed)

| Package | Why Unchanged |
|---------|---------------|
| `packages/connector/src/*` | Negotiation doesn't touch connection layer |
| `packages/observability/src/*` | Unrelated |
| `packages/router/src/*` | Unrelated to negotiation UX |
| `packages/vault/src/*` | Already provides key access; no changes needed |
| `packages/sdk-generator/src/*` | Downstream consumer; negotiate only triggers it, doesn't change it |
| `packages/core/src/*` | Shared types already sufficient |
| `packs/*/` | Provider pack format unchanged |

## Architectural Patterns

### Pattern 1: Extracted Command Handler

**What:** Each CLI command lives in its own file under `apps/cli/src/commands/<name>.ts` with a standard surface: `handleXCommand()`, `printXHelp()`, `parseXArgs()`. The main `index.ts` switch statement becomes a thin router.

**Current state:** Negotiate is the only major command still inline. All others (connect.ts, evolve.ts, sdk.ts, billing.ts, setup.ts, lock.ts, pack.ts, route.ts, etc.) already follow this pattern.

**When to use:** Any CLI command with more than ~50 lines of logic.

**Trade-offs:**
- Pro: Testable in isolation. Clean git diffs. Parallel development.
- Pro: Matches existing convention (14 out of 15 commands already extracted).
- Con: One extra import line in index.ts.

**Implementation:**

```typescript
// apps/cli/src/commands/negotiate.ts (NEW -- extracted from index.ts lines 678-986)
export interface NegotiateOptions {
  intent?: string;
  provider?: string;
  /**
   * If true, enter interactive mode for field-level schema editing
   * after LLM negotiation. Auto-enabled when no --provider specified.
   */
  interactive?: boolean;
  schemaFile?: string;
  noCache?: boolean;
  format?: "json" | "table";
}

export async function handleNegotiateCommand(rawArgs: string[]): Promise<void> { ... }
export function printNegotiateHelp(): void { ... }
export function parseNegotiateArgs(argv: string[]): NegotiateOptions { ... }
```

**Changes to index.ts:**
```typescript
// REMOVE these from apps/cli/src/index.ts:
//   - negotiate() function (lines 678-986)
//   - printNegotiateHelp() function (lines 232-260)
//
// ADD to imports:
import { handleNegotiateCommand, printNegotiateHelp } from "./commands/negotiate.js";
//
// UPDATE case "negotiate":
case "negotiate":
  if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
    printNegotiateHelp();
  } else {
    await handleNegotiateCommand(rawArgs);
  }
  break;
```

### Pattern 2: Schema Editing with Versioned Copy

**What:** The negotiated schema is treated as immutable; user edits create a new copy with a re-computed hash. This preserves the existing `hashSchema()` + `schema_id` contract and makes "reset to LLM proposal" easy.

**When to use:** Any user-in-the-loop schema manipulation.

**Trade-offs:**
- Pro: Clean separation between "LLM proposed" and "user edited". Easy undo.
- Pro: schema_id always reflects the actual schema being used.
- Con: Slightly more memory (two schema objects). Negligible for our schema sizes (max 10 fields, depth 2).

```typescript
// packages/negotiator/src/schema-editor.ts -- new exports
export interface SchemaFieldEdit {
  action: "add" | "remove" | "toggle_required";
  field?: { name: string; type: string; required: boolean };
  fieldName?: string;
}

/**
 * Apply an edit to a schema and return a new schema with re-computed hash.
 * The original schema is not mutated.
 */
export function editSchema(
  schema: Schema,
  edit: SchemaFieldEdit
): { schema: Schema; schema_id: string } {
  const fields =
    edit.action === "add" && edit.field
      ? [...schema.fields, edit.field]
      : edit.action === "remove" && edit.fieldName
        ? schema.fields.filter((f) => f.name !== edit.fieldName)
        : edit.action === "toggle_required" && edit.fieldName
          ? schema.fields.map((f) =>
              f.name === edit.fieldName
                ? { ...f, required: !f.required }
                : f
            )
          : schema.fields;

  const newSchema: Schema = { ...schema, fields };
  return {
    schema: newSchema,
    schema_id: hashSchema(normalizeSchema(newSchema)),
  };
}

/**
 * Validate that a proposed field edit would produce a valid schema
 * against the given manifest constraints. Returns warnings without
 * executing the edit.
 */
export function validateFieldEdit(
  schema: Schema,
  edit: SchemaFieldEdit,
  constraints: ManifestConstraint
): string[] {
  const warnings: string[] = [];
  if (edit.action === "add" && edit.field) {
    if (schema.fields.some((f) => f.name === edit.field!.name)) {
      warnings.push(`Field "${edit.field.name}" already exists`);
    }
    if (edit.field.required) {
      const expectedType = constraints.type?.[edit.field.name];
      if (expectedType && edit.field.type !== expectedType) {
        warnings.push(`Expected type "${expectedType}" for "${edit.field.name}", got "${edit.field.type}"`);
      }
    }
  }
  if (edit.action === "remove" && edit.fieldName) {
    const isRequired = constraints.required?.includes(edit.fieldName);
    if (isRequired) {
      warnings.push(`Field "${edit.fieldName}" is required by provider manifest`);
    }
  }
  return warnings;
}
```

### Pattern 3: Flow Builder for Post-Negotiation Routing

**What:** After interactive negotiation completes, the user is presented with a menu of next-step actions. Each action:
1. Collects any missing parameters (e.g., input JSON for connect)
2. Delegates to the appropriate command handler (connect / sdk generate / evolve)
3. Returns to the menu on completion

**When to use:** Workflow commands that naturally flow into other commands.

**Trade-offs:**
- Pro: Increases completion rate. Users don't have to remember commands.
- Pro: Can guide users toward next logical steps.
- Con: Creates cross-command coupling. Menus must handle cancellation gracefully.

```typescript
// Inside negotiate.ts -- post-negotiation routing

interface NegotiationSession {
  provider: string;
  intent: string;
  packDir: string;
  lock: SchemaLock;
  editedSchema?: Schema;
  feature: ProviderFeature;
}

type NextAction = "connect" | "sdk" | "evolve" | "save" | "exit";

async function promptNextAction(): Promise<NextAction> {
  const map: Record<string, NextAction> = {
    "Test with connect (make an API call)": "connect",
    "Generate zero-dependency SDK": "sdk",
    "Generate SDK via evolve (batch)": "evolve",
    "Save result only": "save",
    "Exit": "exit",
  };
  const selected = await promptSelect("What would you like to do next?", Object.keys(map));
  return map[selected] ?? "exit";
}

async function routeToConnect(session: NegotiationSession): Promise<void> {
  const input = await promptJson("Enter input JSON");
  await handleConnectCommand([
    session.provider,
    session.intent,
    "--input", JSON.stringify(input),
    "--lock", session.lock.lock_id,
  ]);
}

async function routeToSdk(session: NegotiationSession): Promise<void> {
  await handleSdkCommand([
    "generate",
    "--pack", session.packDir,
    "--lang", "typescript",
    "--output", `./${session.provider}-sdk`,
    "--provider", session.provider,
  ]);
}
```

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| LLM API (OpenAI-compatible) | Used by `negotiateSchema()` for initial schema generation | Key stored in vault as `negotiator-llm`. Also available via `OPENAI_API_KEY` env. In interactive mode, user is warned if no LLM key is found; stub schema generation still works. |
| Registry | Fire-and-forget verification submission; optional pack update check | Interactive negotiation submits verification but does not block on Registry. Unchanged. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `negotiate.ts` <-> `@synapse-router/negotiator` | Direct function calls | `negotiateSchema()`, `matchManifest()`, `loadManifestFromPack()`, `runMockTest()`, `buildSuggestions()`. Interactive mode calls these separately rather than going through monolithic `negotiateAndVerify()`. |
| `negotiate.ts` <-> `@synapse-router/lock` | `getOrCreateLock()` / `LockStorage` | Lock is saved after negotiation. In interactive mode, lock is always created fresh (bypasses cache by passing intent + provider that may differ from cache key). |
| `negotiate.ts` <-> `connect.ts` | CLI-level delegation via `handleConnectCommand()` | After negotiation, "Test with connect" re-invokes connect handler with pre-filled provider/intent/lock. |
| `negotiate.ts` <-> `sdk.ts` | CLI-level delegation via `handleSdkCommand()` | After negotiation, "Generate SDK" re-invokes sdk handler with pre-filled pack/provider. |
| `negotiate.ts` <-> `@synapse-router/vault` | `createVault().getKey()` | Read LLM API key for schema generation. Same as current behavior. |
| `negotiate.ts` <-> `apps/cli/src/utils/prompt.ts` | Shared prompt functions | `prompt()`, `promptSelect()`, `promptJson()`, `promptConfirm()` for interactive input. |

## Files: New vs Modified

### New Files

| File | Purpose | Line Estimate | Depends On |
|------|---------|---------------|------------|
| `apps/cli/src/commands/negotiate.ts` | Extracted negotiate command: arg parsing, interactive flow, post-negotiation routing | ~400 lines | `@synapse-router/negotiator`, `@synapse-router/lock`, `apps/cli/src/utils/prompt.ts` |
| `apps/cli/src/utils/prompt.ts` | Shared interactive prompt utilities (extract from setup.ts, connect.ts, billing.ts) | ~80 lines | `node:readline` |
| `packages/negotiator/src/schema-editor.ts` | Programmatic schema manipulation: `editSchema()`, `validateFieldEdit()` | ~80 lines | `@synapse-router/core` (hashSchema, normalizeSchema, validateSchema) |

### Modified Files

| File | Change Type | Scope |
|------|-------------|-------|
| `apps/cli/src/index.ts` | Remove inline negotiate code | Delete `negotiate()` function (lines 678-986) and `printNegotiateHelp()` (lines 232-260). Replace `case "negotiate"` with `handleNegotiateCommand(rawArgs)`. Add import for `handleNegotiateCommand`/`printNegotiateHelp`. |
| `apps/cli/src/commands/connect.ts` | Add cross-command integration path | Accept `--lock <lock_id>` argument to skip lock resolution when called from negotiate. Currently the connect command has its own `--lock` flag; verify existing path works for this use case. |
| `apps/cli/src/commands/sdk.ts` | Add cross-command integration path | Accept provider/pack passed from negotiate context. Currently the sdk command requires `--pack` explicitly; add convenience passthrough from negotiate session. |
| `apps/cli/src/commands/setup.ts` | Refactor to use shared prompts | Replace inline readline helpers with imports from `apps/cli/src/utils/prompt.ts`. |
| `apps/cli/src/commands/billing.ts` | Refactor to use shared prompts | Same refactoring as setup.ts. |
| `packages/negotiator/src/index.ts` | Add new exports | Export `editSchema`, `validateFieldEdit`, `SchemaFieldEdit` from `schema-editor.ts`. |

## Build Order

```
Phase A: Refactor -- Extract negotiate from index.ts
=====================================================
  apps/cli/src/commands/negotiate.ts        (NEW -- extract from index.ts)
  apps/cli/src/index.ts                     (MODIFY -- remove inline negotiate, add import)
  Explanation: Pure refactor. Zero behavioral change. The existing negotiate()
  function moves verbatim into the new file. index.ts get a thin import + switch case.
  Risk: None. All existing tests pass unchanged.

Phase B: Infrastructure -- Shared prompt utilities
=====================================================
  apps/cli/src/utils/prompt.ts              (NEW -- shared prompt helpers)
  apps/cli/src/commands/setup.ts            (MODIFY -- use shared prompts)
  apps/cli/src/commands/connect.ts          (MODIFY -- use shared prompts)
  apps/cli/src/commands/billing.ts          (MODIFY -- use shared prompts)
  Explanation: Extracts duplicate readline patterns (prompt/promptSelect/promptJson/promptConfirm)
  from setup.ts, connect.ts, billing.ts. Reduces ~50 lines of duplicated code.
  Risk: If shared prompts have different behavior, existing flows break. Must test:
    - prompt() should return empty string for blank input (same as existing)
    - promptSelect() should default to index 0 on invalid input
    - promptJson() should return {} on invalid JSON

Phase C: Schema Editor -- Negotiator extension
=====================================================
  packages/negotiator/src/schema-editor.ts  (NEW)
  packages/negotiator/src/index.ts          (MODIFY -- add exports)
  Explanation: Pure functions for field manipulation. No side effects, no CLI deps.
  Add unit tests:
    - addField: schema has new field, schema_id changes
    - removeField: field removed, schema_id changes
    - toggleRequired: field flips required flag
    - validateFieldEdit: warns on duplicate field name, warns on removing required field
    - editSchema: original schema is not mutated (immutability)
  Risk: None. Pure functions with no external deps beyond @synapse-router/core.

Phase D: Interactive Flow -- Main feature
=====================================================
  apps/cli/src/commands/negotiate.ts        (MODIFY -- add interactive editing loop)
  Explanation: Adds the schema editing loop after LLM negotiation (step 5 in data flow):
    1. Display schema table with fields
    2. Loop: prompt action -> edit -> re-display
    3. Validate against manifest on "done"
    4. Offer "force save" if mismatches remain
  This is the core user-facing change of v5.0.
  Risk: Moderate. The interactive loop must handle edge cases:
    - Empty schema (all fields removed) -> should the lock still be saved?
    - Field with name collision -> prevent or warn
    - LLM returned stub schema -> show low-confidence warning

Phase E: Post-Negotiation Routing
=====================================================
  apps/cli/src/commands/negotiate.ts        (MODIFY -- add routing menu)
  apps/cli/src/commands/connect.ts          (MODIFY -- accept --lock passthrough)
  apps/cli/src/commands/sdk.ts              (MODIFY -- accept provider/pack passthrough)
  Explanation: After negotiation + editing, offer next-step menu.
  connect.ts change: verify --lock <id> flag already exists; test that calling
    connect with --lock bypasses getOrCreateLock and uses the provided lock directly.
  sdk.ts change: add --provider and --pack passthrough that pre-fills from
    negotiate context. Currently sdk requires explicit --pack and --provider;
    make them accept from negotiate session.
  Risk: Low. Connect already has --lock flag. Sdk changes are additive.

Phase F: Help text + Documentation
=====================================================
  apps/cli/src/commands/negotiate.ts        (MODIFY -- update help)
  apps/cli/src/index.ts                     (MODIFY -- update top-level help)
  Explanation: Add --interactive flag to help text, update examples.
  Risk: None.
```

## Anti-Patterns

### Anti-Pattern 1: Schema Editing Inside Negotiator's Pipeline

**What:** Modifying `negotiateAndVerify()` to add interactive callbacks or mutation hooks inside the existing pipeline.

**Why wrong:** The existing `negotiateAndVerify()` is a fully automated pipeline designed for headless/CI use. Adding interactive branches creates conditional complexity, makes the API harder to reason about, and forces every consumer (CLI, API, MCP server) to handle interactive state they may not want.

**Do instead:** Keep `negotiateAndVerify()` as-is for automated use. Build interactive negotiation as a CLI-level orchestration that calls the lower-level primitives (`negotiateSchema()` + `matchManifest()` + `runMockTest()`) separately with user input between steps.

### Anti-Pattern 2: Storing the Full Negotiated Schema Inside the Lock

**What:** Adding `negotiated_schema` or `user_edits` fields to the `SchemaLock` interface, storing the agent-side schema inside provider-side lock persistence.

**Why wrong:** SchemaLock is a cache of the **provider's** canonical schema (intent, feature, field_mappings, connection). Mixing agent-side schemas conflates two concerns. The lock has a specific responsibility: enabling deterministic connect calls without re-negotiation. Adding agent schema data bloats it and creates confusion about what the lock represents.

**Do instead:** Store user's negotiated/edited schema in a separate location:
- Negotiation memo system (listed as active feature in PROJECT.md): `~/.synapse/memos/<intent>_<provider>_<timestamp>.md`
- Or a lightweight JSON record: `~/.synapse/negotiations/<schema_id>.json`
- The lock stays pure provider-side data.

### Anti-Pattern 3: Modal/Long-Running Interactive State in the Negotiator Package

**What:** Adding interactive prompt calls (`readline.question()`) inside `@synapse-router/negotiator` or `@synapse-router/lock` packages.

**Why wrong:** Package code should be testable and usable from any consumer (CLI, API server, MCP server, programmatic use). Interactive prompts are a CLI-only concern.

**Do instead:** Keep all `readline`/prompt code in `apps/cli/src/`. The negotiator package exports pure data transformation functions (`editSchema()`, `validateFieldEdit()`). The CLI calls these and wraps them with prompts.

### Anti-Pattern 4: Caching the Interactive Lock

**What:** When `getOrCreateLock()` is called during interactive negotiation, caching the result so subsequent `synapse connect` calls reuse the cached lock without the user knowing.

**Why wrong:** Lock caching is useful for automated flows but harmful in interactive negotiation: if the user edits the schema, the cached lock still reflects the provider's canonical schema (not the edits). Next connect call would silently use the wrong lock.

**Do instead:** In interactive mode, always create the lock fresh (pass `--no-cache` semantics). The lock itself is still the provider's canonical schema (it should not store user edits), but the user's field selections are captured in a separate memo.

### Anti-Pattern 5: Adding a New Top-Level Command

**What:** Adding `synapse interact` or a new top-level command specifically for interactive negotiation.

**Why wrong:** The `synapse negotiate` command already exists in the help system and has documented behavior. Adding a second interactive command fragments the UX. The `--interactive` flag is the standard pattern (like `--json` for output format).

**Do instead:** Extend the existing `synapse negotiate` command with an `--interactive` flag. The default behavior (`--intent --provider` without `--interactive`) stays exactly as it is today. Interactive mode auto-activates when `--provider` is not specified (same pattern as `synapse connect` which degrades to interactive when args are missing).

## Scaling Considerations

| Concern | At single-user dev | At team/multi-project | Notes |
|---------|-------------------|----------------------|-------|
| Negotiation memo storage | `~/.synapse/memos/` or `.synapse/memos/` | Checked into git (markdown) | Memos are text files, git-friendly. |
| Lock cache invalidation | Unchanged -- existing `getOrCreateLock()` version check | Same -- version check is field-level | Interactive mode always creates fresh lock, never reads cache. |
| Post-negotiation routing | CLI inline delegation | Same -- no server component | Routing is CLI-local, no distributed state. |
| Shared prompt utilities | In `apps/cli/src/utils/prompt.ts` | Same | No cross-project sharing needed. |

## Sources

- Codebase reading: `apps/cli/src/index.ts` lines 232-260 (printNegotiateHelp) and lines 678-986 (negotiate function body) -- the exact code to be extracted
- Codebase reading: `packages/negotiator/src/index.ts` (negotiateSchema, createDefaultLLMClient, exports) -- publicly available functions the interactive flow will call separately
- Codebase reading: `packages/negotiator/src/verifier.ts` (negotiateAndVerify pipeline) -- the monolithic pipeline we are NOT modifying
- Codebase reading: `packages/negotiator/src/manifest.ts` (loadManifestFromPack, matchManifest, buildSuggestions) -- lower-level primitives the interactive flow will use
- Codebase reading: `packages/negotiator/src/retry.ts` (retryWithFeedback with structured error feedback) -- automated retry logic, irrelevant for interactive mode
- Codebase reading: `packages/lock/src/lock.ts` (getOrCreateLock, buildLockFromProviderCard, computeCacheKey) -- lock creation and caching
- Codebase reading: `apps/cli/src/commands/connect.ts` (pattern for command extraction, interactive prompts, billing integration) -- model for how negotiate.ts should be structured
- Codebase reading: `apps/cli/src/commands/setup.ts` (existing interactive prompt pattern) -- source of duplicate readline patterns to unify
- Codebase reading: `apps/cli/src/utils/config.ts` (config utility pattern) -- model for shared utility module in apps/cli/src/utils/
- Codebase reading: `apps/cli/src/commands/sdk.ts` (sdk command structure) -- downstream consumer for post-negotiation routing
- CONSTRAINT: PROJECT.md (v5.0 interactive negotiation user journey, "协商记忆" active feature) -- requirements this architecture serves
- CONSTRAINT: CLAUDE.md (architecture principles: CLI is primary interface, negotiate develops incrementally, SDK zero dependency) -- design constraints
- Confidence: HIGH -- all findings verified against actual source code in this repository.

---
*Architecture research for: Synapse Router v5.0 interactive negotiation integration*
*Researched: 2026-05-25*
