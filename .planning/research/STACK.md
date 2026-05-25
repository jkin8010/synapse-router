# Stack Research

**Domain:** Interactive CLI negotiation, command simplification, streamlined user journey for Synapse Router v5.0
**Researched:** 2026-05-25
**Confidence:** HIGH

---

## Part 1: Interactive CLI Prompts (v5.0 Core)

### Core Technology — `@inquirer/prompts`

| Technology | Version | Purpose | Why Recommended |
| --- | --- | --- | --- |
| `@inquirer/prompts` | 8.4.3 | Interactive CLI prompts (select, checkbox, confirm, input, password, search) | **Replaces all hand-rolled `node:readline` code** scattered across 4 command files. Pure ESM, modular (tree-shakeable), Node 22.13+ compatible. Provides arrow-key navigation, type-specific input, proper password masking (no stdout hack), multi-select (checkbox) for schema field customization, and built-in Ctrl+C handling via typed `ExitPromptError`. Actively maintained by the Inquirer.js team. |
| `picocolors` | 1.1.1 | Terminal ANSI color formatting | **New addition.** 2 KB zero-dependency library for colored status indicators, section headers, and error highlights. Used across all commands. Replaces the current plain-text visual separators and emoji with color-coded output for better scannability. |
| `ora` | 9.4.0 | Terminal spinner for async operations | **Optional — only for `synapse evolve`.** Shows progress during batch SDK generation (multiple providers sequentially). Node 20+ compatible. If not added, `evolve` uses console.log status lines (existing behavior unchanged). |

#### What Each @inquirer/prompts Module Will Replace

| Module | Replaces in | Usage |
| --- | --- | --- |
| `select` | `setup.ts`, `connect.ts`, `billing.ts` | Arrow-key navigable provider/intent selection instead of numbered lists |
| `checkbox` | `index.ts` (negotiate) | Multi-field selection for schema customization — user selects which fields to include |
| `confirm` | `connect.ts`, `billing.ts` | Yes/no prompts for billing, lock overwrite, next-step actions |
| `input` | `setup.ts`, `connect.ts`, `evolve.ts` | Text entry for base URL, project name, custom field values |
| `password` | `setup.ts` | API key entry — replaces the stdout-suppression hack in `setup.ts` |
| `search` | `connect.ts`, `setup.ts` | Type-to-filter provider selection (when many providers go live) |
| `number` | `connect.ts`, `setup.ts` | Numeric input for rate limits, max tokens, timeout values |

#### Why NOT the Alternatives

| Alternative | Why Not |
| --- | --- |
| `enquirer` 2.4.1 | Feature-rich but community maintenance is less clear. Node >=8.6 is too inclusive (we know we need 22+). The prompts overlap with `@inquirer` but `@inquirer` provides better TypeScript types and ESM compatibility. |
| `@clack/prompts` 1.4.0 | Beautiful spinner-centric design but **opinionated to a fault**: cyan-only theme, mandatory spinner frames, limited prompt types (no `search`, `expand`, `editor`). The spinning indicator conflicts with Synapse CLI's existing "log-style" output pattern. |
| Hand-rolled `node:readline` (current) | Already proven problematic: **three separate implementations** with different APIs, no keyboard navigation, no type validation, stdout-hack password masking, no multi-select support. Every new interactive command duplicates this code. |

### Installation

```bash
# Core interactive prompts + color output
cd apps/cli
pnpm add @inquirer/prompts@^8.4
pnpm add picocolors@^1.1

# Optional (evolve progress spinner)
pnpm add ora@^9.4
```

### Version Compatibility

| Package | Compatible With | Notes |
| --- | --- | --- |
| `@inquirer/prompts@8.4.3` | Node >=22.13.0 | Project uses Node 22+ — fully compatible |
| `@inquirer/prompts@8.4.3` | ESM (`"type": "module"`) | Package is pure ESM, matches project's `package.json` |
| `picocolors@1.1.1` | Any Node version | Zero dependencies, pure ESM + CJS dual package |
| `ora@9.4.0` | Node >=20 | Fully compatible with Node 22+ |

---

## Part 2: Command Simplification (No Framework)

### Current State

| Metric | Value |
| --- | --- |
| Command files | 17 |
| CLI entry point | ~1249 lines (`index.ts`) with manual `parseArgs()`, 20+ `case` branches |
| Overlapping commands | `setup` overlaps with `vault set` + `config set`; `negotiate` overlaps with `connect`; `sdk generate` overlaps with `evolve` |
| Interactive prompt locations | `setup.ts` (2 functions), `connect.ts` (3 functions), `billing.ts` (1), `evolve.ts` (1) |

### Recommendation: Keep Manual Arg Parsing, Merge Commands

**Do NOT add a command framework (yargs, commander, cac).** The manual `parseArgs()` function is 25 lines and well-understood. Adding a framework would require refactoring all 17 command handlers for marginal benefit. The simplification should happen at the **command topology level** — fewer top-level commands, not a new parsing library.

#### Merge Plan

| Current Command | Fate | Rationale |
| --- | --- | --- |
| `negotiate` | Merge into `connect` | `negotiate --intent X --provider Y` is really "connect with schema exploration". Becomes `connect --interactive --intent X --provider Y`. |
| `tune` | Fold into `evolve` | `evolve --tune` already exists. Remove standalone `tune` command. |
| `generate` | Fold into `pack generate` | Pack generation from OpenAPI spec is a pack management concern. |
| `smoke` | Fold into `connect --dry-run` | Smoke tests are `connect` with `--validate-only`. |
| `watchdog` | Move to `dev watchdog` | Under a new `synapse dev` command group. |
| `profile` | Fold into `config` | Profile management is configuration. |
| `export`/`import` | Fold into `config export`/`config import` | Data export/import is configuration-related. |
| `init` | Merge into `setup` | `setup` is the guided first-run experience. |

**Target: 7 top-level commands** (down from ~20):

```text
synapse setup      -> Guided first-run wizard (merges setup + init + vault set step)
synapse connect    -> Interactive/imperative provider connect (merges negotiate)
synapse evolve     -> Batch SDK generation (merges tune)
synapse config     -> Config management (merges profile + export/import)
synapse vault      -> API key management (unchanged, but enhanced)
synapse pack       -> Pack management (merges generate + provider list/show)
synapse route      -> Multi-dimensional routing (unchanged)
synapse dev        -> Development utilities (watchdog)
```

### Why NOT a Command Framework

| Framework | Why Not |
| --- | --- |
| `yargs` 17.7 | Heavy (300KB+), magic string parsing DSL. Would require restructuring 17 command files and the 1249-line entry point. Adds dependency surface. |
| `commander` 13.1 | Same problem — requires wrapping every command in a program object. The current switch-case is straightforward. |
| `cac` 6.7 | Lightest option at 30KB (used by Vite) but still a refactor of all command signatures. Not worth it. |

**Decision:** Keep `parseArgs()`. The 25-line function handles flags, positional args, and help detection adequately. The real simplification is reducing the number of commands, not changing how they are parsed.

---

## Part 3: Interactive Workflow Orchestration

### Approach: Plain Async Functions (No State Machine)

The interactive workflows (setup wizard, negotiate flow, post-action next-steps) should be orchestrated with plain async functions, not a state machine library.

#### Workflow: `synapse setup`

```typescript
// Simplified pseudocode — replaces current setup.ts
import { select, input, password, confirm } from '@inquirer/prompts';

async function interactiveSetup() {
  // Step 1: Create vault if not exists
  await ensureVault();

  // Step 2: Provider selection (search when >10 providers)
  const provider = await select({
    message: 'Choose a provider:',
    choices: providerPresets,
  });

  // Step 3: API key (proper hidden input)
  const apiKey = await password({ message: 'Enter your API key:' });

  // Step 4: Base URL (prefilled default)
  const baseUrl = await input({
    message: 'Base URL:',
    default: providerPresets[provider].baseUrl,
  });

  // Step 5: Auto-configure and suggest next steps
  const shouldTest = await confirm({
    message: 'Would you like to test the connection now?',
    default: true,
  });

  if (shouldTest) {
    // Route to connect with pre-filled params
  }
}
```

#### Workflow: `synapse connect --interactive` (upgraded negotiate)

```typescript
import { select, checkbox, confirm } from '@inquirer/prompts';

async function interactiveNegotiate(providerId: string, intent: string) {
  // 1. Show schema overview (same as current negotiate display)
  displaySchema(feature);

  // 2. Let user customize input fields
  const selectedFields = await checkbox({
    message: 'Select input fields to include:',
    choices: feature.input.fields.map(f => ({
      name: `${f.name} (${f.type})${f.required ? ' *' : ''}`,
      value: f.name,
      checked: f.required,    // required fields pre-checked
      disabled: f.required,   // required fields can't be unchecked
    })),
  });

  // 3. Confirm schema
  const confirmed = await confirm({
    message: 'Confirm negotiated schema?',
    default: true,
  });

  if (!confirmed) {
    return; // loop back or abort
  }

  // 4. Save lock
  await saveLock(providerId, intent, selectedFields);

  // 5. Offer next steps
  const nextStep = await select({
    message: 'What would you like to do next?',
    choices: [
      { name: 'Test connection (synapse connect)', value: 'connect' },
      { name: 'Generate SDK (synapse evolve)', value: 'evolve' },
      { name: 'Show SDK code sample', value: 'sdk-code' },
      { name: 'Finish', value: 'done' },
    ],
  });
  // Route to selected action
}
```

### Architecture: Shared Prompt Helpers

Create a shared `src/utils/prompts.ts` module to avoid the current code duplication:

```text
apps/cli/src/
  utils/
    prompts.ts      -> Reusable prompt wrappers (provider selection, field selection, intent selection)
    config.ts       -> Config loading/saving (already exists)
  commands/
    ...              -> Each command imports from utils/prompts.ts instead of duplicating readline code
```

**Shared exports from `utils/prompts.ts`:**

```typescript
// Provider selection (reusable across setup, connect, negotiate)
export async function promptProviderSelection(
  options?: { includeRemote?: boolean }
): Promise<string>;

// Intent/feature selection for a provider
export async function promptIntentSelection(providerId: string): Promise<string>;

// Multi-field selection for schema customization
export async function promptFieldSelection(
  fields: FieldDef[], message?: string
): Promise<string[]>;

// JSON input for connect params
export async function promptJsonInput(
  message: string,
  defaultValue?: Record<string, unknown>
): Promise<Record<string, unknown>>;

// Confirmation with contextual help
export async function promptConfirm(
  message: string,
  options?: { helpText?: string; defaultVal?: boolean }
): Promise<boolean>;
```

This eliminates duplication and provides a single place to upgrade prompts (e.g., adding i18n later).

---

## What NOT to Use

| Avoid | Why | Use Instead |
| --- | --- | --- |
| `yargs` / `commander` / `cac` | Command framework refactor would touch 17 command files + 1249-line entry point for marginal benefit. The 25-line `parseArgs()` is sufficient. | Keep manual `parseArgs()`. Simplify by merging commands (20 to 7), not adding parsing middleware. |
| `@clack/prompts` | Opinionated spinner-heavy design conflicts with Synapse CLI's existing log-style output. No support for `checkbox`, `search`, `expand`, `editor`. | `@inquirer/prompts` |
| `enquirer` | Less actively maintained. Styling not as clean. Node >=8.6 too permissive. | `@inquirer/prompts` |
| `ink` (React for CLI) | 500KB+ bundle, React reconciliation for CLI output. Absurd overkill. | `@inquirer/prompts` |
| `terminal-kit` / `blessed` | Full TUI framework. Synapse CLI is a command-line tool, not an interactive terminal application. | Plain prompts via `@inquirer/prompts` |
| `listr2` | Task runner with list rendering. Heavy for the few sequential steps in evolve. | `ora` spinner (optional) or console.log status lines. |
| `cli-table3` | Current manual table formatting is simple and adequate. | Manual `string.padEnd()` formatting (existing). |
| Zustand / XState / robot | State machine libraries for workflow orchestration. The workflows are linear or tree-like, not stateful enough to warrant XState. | Plain async functions with `@inquirer/prompts`. |
| `chalk` | `chalk@5` is 20KB and only ESM. No meaningful advantage over `picocolors` at 2KB. | `picocolors@1.1.1` |

---

## Stack Patterns by Variant

**If Node.js 22+ minimum is enforced (as it is):**

- `@inquirer/prompts@^8.4` works at Node 22.13+
- No polyfills or compatibility shims needed
- Use native `await import('@inquirer/prompts')` for lazy loading in commands that may not need prompts (imperative mode)

**If the CLI is used in CI/scripts (no TTY):**

- `@inquirer/prompts` auto-detects TTY and exits with `ExitPromptError` on non-TTY stdin
- The existing "imperative degradation" pattern already handles this: commands try imperative mode first, only prompt when mandatory params are missing
- Ensure all commands have complete imperative flag coverage (current `connect` already does this)
- Add `process.env.CI` detection to skip prompts entirely and fail with a clear error message

**If the CLI needs Chinese/English locale switching:**

- `@inquirer/prompts` has built-in i18n via `@inquirer/i18n` — auto-detects from `LANGUAGE`, `LC_ALL`, `LC_MESSAGES`, `LANG` env vars
- For custom prompt messages, wrap strings in a translation function (defer implementation)
- `picocolors` is locale-agnostic

**If `evolve` batch SDK generation needs progress indication:**

- Add `ora@^9.4` and wrap each provider's SDK generation step:

  ```typescript
  const spinner = ora('Generating SDK for provider 1/5...').start();
  await generateSDK(provider);
  spinner.succeed(`SDK generated for ${provider.id}`);
  ```

- If `ora` is not added (dependency minimalism), use console.log with timestamps instead

**If no interactive prompts are needed for a particular CLI session:**

- All commands degrade gracefully when missing mandatory params via `--help` exit
- The `@inquirer/prompts` modules are only imported when interactive mode activates (lazy `await import()` via existing dynamic import pattern)
- No performance impact for scripted usage
- The shared `utils/prompts.ts` wrapper handles this:

  ```typescript
  if (!process.stdin.isTTY || flags.has('no-interactive')) {
    throw new Error('Missing required param');
  }
  ```

---

## Integration with Existing CLI

### Touch Points

| File | Current Interactive Code | Replacement |
| --- | --- | --- |
| `apps/cli/src/commands/setup.ts` | `prompt()` (26 lines), `promptSelect()` (14 lines), `node:readline` stdout hack for password | `@inquirer/prompts`: `select`, `input`, `password`, `confirm` |
| `apps/cli/src/commands/connect.ts` | `promptSelect()` (21 lines), `promptSelectProvider()` (14 lines), `promptSelectIntent()` (15 lines), `promptJson()` (15 lines), billing confirm (12 lines) | `@inquirer/prompts`: `select`, `input`, `confirm` |
| `apps/cli/src/index.ts` (negotiate) | No interactive prompts yet — only `console.log` display | `@inquirer/prompts`: `checkbox`, `confirm`, `select` for schema customization + next-step routing |
| `apps/cli/src/commands/billing.ts` | `confirm` via `readline` (5 lines) | `@inquirer/prompts`: `confirm` |
| `apps/cli/src/commands/evolve.ts` | `readline` import (not heavily used) | `@inquirer/prompts`: `confirm` (if needed) |

### Safe Rollout Strategy

1. **Phase 1: Create `utils/prompts.ts`** — Consolidate all prompt operations into one module. No existing files changed yet.
2. **Phase 2: Replace `setup.ts` prompts** — Wire in `select`, `password`, `input`, `confirm`. Safest first change since `setup` is exclusively interactive.
3. **Phase 3: Replace `connect.ts` prompts** — Wire in `select`, `input`, `confirm`. Existing imperative paths unchanged.
4. **Phase 4: Add interactive `negotiate` mode** — New code in `index.ts` using `checkbox`, `confirm`, `select`. Can be disabled via flag to avoid breakage.
5. **Phase 5: Cleanup** — Remove `prompt*` functions from `setup.ts`, `connect.ts`. The `utils/prompts.ts` module is the single source of truth.

### Disabling Interactive Mode

All commands must remain scriptable. The `@inquirer/prompts` integration must be bypassed when:

- `--help` or `-h` flag is present -> show help text, exit
- `--no-interactive` flag -> error with "missing required param" message
- `process.env.CI === 'true'` -> same behavior as `--no-interactive`
- All mandatory flags are provided -> skip prompts entirely (current behavior, unchanged)

The `utils/prompts.ts` wrapper enforces this:

```typescript
function canPrompt(): boolean {
  return process.stdin.isTTY
    && !process.argv.includes('--no-interactive')
    && process.env.CI !== 'true';
}
```

---

## Sources

- npm registry via `npm view` for all version numbers — confirmed `@inquirer/prompts@8.4.3`, `picocolors@1.1.1`, `ora@9.4.0`, `enquirer@2.4.1`, `@clack/prompts@1.4.0` — HIGH confidence
- @inquirer/prompts GitHub README (github.com/SBoudrias/Inquirer.js) — prompt types, API, ESM compatibility, Node version requirements, i18n support, ExitPromptError handling — HIGH confidence
- Direct source code review of `apps/cli/src/index.ts`, `connect.ts`, `setup.ts`, `billing.ts`, `evolve.ts` — confirmed 4 files with duplicated `node:readline` prompt implementations, no existing ANSI color dependencies, 17 command files with 20+ top-level commands — HIGH confidence
- Project `.planning/PROJECT.md` — confirmed v5.0 requirements for interactive negotiation, command simplification, streamlined user journey — HIGH confidence

---
*Stack research for: Synapse Router v5.0 Interactive Negotiation and Experience Optimization*
*Researched: 2026-05-25*
