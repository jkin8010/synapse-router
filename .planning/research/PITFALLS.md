# Pitfalls Research: v5.0 Interactive Negotiation & Experience Optimization

**Domain:** Adding interactive Schema negotiation flow, command simplification, and streamlined user journey to an existing TypeScript CLI tool (20 commands, manual arg parsing, zero TTY detection, LLM-powered negotiation pipeline with deterministic stub fallback)
**Researched:** 2026-05-25
**Confidence:** HIGH (based on codebase analysis of CLI, negotiator, connect/setup patterns, pack.ts `--yes` flag pattern, and CLI test suite; plus WebSearch research on interactive CLI pitfalls, TTY detection patterns, and AI-agent-friendly CLI design principles)

---

## Critical Pitfalls

### Pitfall 1: No TTY Detection — Interactive Prompts Hang in CI, Pipes, and AI Agents

**What goes wrong:**
The CLI has zero `isTTY` checks anywhere. `connect.ts`, `setup.ts`, `billing.ts`, `evolve.ts`, and future `negotiate.ts` all unconditionally create `readline.createInterface({ input: process.stdin, ... })` and call `rl.question()`. When stdin is piped (`echo '{}' | synapse negotiate`), closed (`synapse negotiate ... < /dev/null`), or forwarded through a pseudo-TTY from an AI coding agent, these calls hang indefinitely waiting for input that will never arrive. The process does not exit. CI pipelines hang. Shell scripts hang. AI agents freeze.

Existing test suite (`index.test.ts`) confirms current practice: all commands are tested via `spawnSync` which bypasses stdin — meaning none of the TTY-conditional code paths are exercised in tests. When interactive prompts are added to `synapse negotiate`, this gap becomes a silent CI breaker.

Additionally, the current negotiator stub fallback (when no LLM key is configured) returns a hardcoded `{ fields: [{ name: "input", type: "string", required: true }] }` -- the negotiator package itself contains no TTY awareness, but the CLI that invokes it has no guard against presenting a useless stub result as a successful negotiation.

**Why it happens:**
- The existing CLI was designed for developers running commands interactively. TTY detection was never a requirement.
- `readline` in Node.js is deceptively simple: a 10-line prompt function works perfectly in a terminal. The failure mode only appears in non-TTY contexts.
- The codebase has three separate interactive patterns (`setup.ts` custom prompt, `connect.ts` inline readline, `evolve.ts` readline) — none guard with TTY checks.
- AI agents are a new consumption pattern; the CLI was not designed with agent consumption in mind.
- The existing `--yes` flag in `pack.ts` and `evolve.ts` is an ad-hoc solution that only covers confirmation prompts, not the full interactive flow.

**How to avoid:**
1. **Create a single shared `isInteractive()` function** used by every command that can prompt:

```typescript
// In src/utils/tty.ts
function isInteractive(): boolean {
  // TTY check: stdin and stdout must be TTYs
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  // CI environment check: even with pseudo-TTY, skip prompts in CI
  // Known CI/agent env vars: CI, GITHUB_ACTIONS, GITLAB_CI, CODE_X, CLAUDE_CODE
  if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI) return false;
  // Explicit opt-out has highest priority
  return true;
}
```

2. **Guard every interactive prompt** with this check. If `!isInteractive()`, fail fast with:
   - A clear error message explaining what was needed
   - The flag to provide it non-interactively (e.g., `--yes`, `--format json`, `--input '...'`)
   - Exit code 1 (not 0 — see openclaw/crestodian bug #73646)

3. **Add `--no-interactive` / `--yes` flags globally** to every command that prompts. This gives explicit opt-out for both human and agent users.

4. **Update the test suite.** At minimum, add tests that pipe stdin and verify non-zero exit codes for interactive commands:
```typescript
it("exits with error when stdin is piped", () => {
  const result = spawnSync("node", [bin, "negotiate", "--intent", "chat", "--provider", "openai"], {
    input: "", // closed stdin
    encoding: "utf8",
  });
  assert.notStrictEqual(result.status, 0);
  assert.ok(result.stderr.includes("--format json") || result.stderr.includes("non-interactive"));
});
```

5. **Detect stub negotiation results.** If the negotiation was performed without an LLM key (stub mode), the output will be the meaningless hardcoded stub schema. Surface this clearly:
   - "Negotiation used deterministic stub (no LLM key configured)"
   - "Configure an LLM key with: synapse vault set negotiator-llm <your-key>"
   - "Or set --llm-api-key for one-time use"

**Warning signs:**
- `process.stdin` and `process.stdout` are accessed directly in command handlers without any `isTTY` guard
- A new readline interface is allocated without checking TTY first
- Test file (`index.test.ts`) has no tests with piped/closed stdin for interactive commands
- The `setup.ts` and `connect.ts` prompt functions are copy-pasted (they are) rather than unified
- PR review shows `rl.question(...)` inside a command handler without a preceding TTY check
- `process.env` references to CI-related variables are absent from the CLI

**Phase to address:**
Phase 1 (scaffold interactive negotiation experience). The shared TTY detection utility must be in place BEFORE any interactive prompts are added to `synapse negotiate`. Retrofitting TTY detection after interactive code is written is possible but error-prone.

---

### Pitfall 2: Monolithic `index.ts` Becomes Untenable With Multi-Step Interactive Flow

**What goes wrong:**
The `negotiate()` function is a 300+ line function living directly in the main CLI entry file (`index.ts`, currently 1248 lines total). It contains:
- Flag parsing for negotiate-specific options
- Provider pack discovery (shared logic duplicated from connect.ts)
- LLM key loading from vault
- Manual `NegotiateAndVerifyInput` construction
- Formatted table output (40+ lines of `console.log`)
- Format flag conditional (json vs table)
- Lock auto-save logic
- Error handling for ContractVerificationError
- Legacy schema file fallback mode

Every other command (connect, setup, billing, evolve, pack, smoke, etc.) has been extracted to its own file in `src/commands/`. The negotiate function is the notable exception, and it is the command that will grow the most in v5.0: interactive field editing, multi-step confirmation, diff preview, user schema customization, inline help prompts.

Adding interactive prompts inline makes the file balloon to 1600+ lines. Testing becomes harder (no separate module to mock). The function accumulates state for both the interactive flow AND the command-line flow in the same scope, creating branch complexity.

**Why it happens:**
- The negotiate function started small (schema file matching mode) and grew organically as `--intent + --provider` mode was added.
- There was never a specific refactor ticket to extract it into `src/commands/negotiate.ts`.
- The function is "working" so it stays where it is. Adding interactive features feels like extension rather than extraction.
- The other command files all follow the same pattern (`handleXCommand(argv) + printXHelp()`), making the extraction pattern well-understood.

**How to avoid:**
1. **Extract negotiate into `src/commands/negotiate.ts` BEFORE adding interactive flow.** Follow the existing pattern:
   - Export `handleNegotiateCommand(argv: string[])` 
   - Export `printNegotiateHelp()`
   - Move all negotiate-specific imports from `index.ts` to the new file

2. **Split the handler into phases that can be unit-tested:**
   ```typescript
   // negotiate.ts
   export async function handleNegotiateCommand(argv: string[]): Promise<void> {
     const options = parseNegotiateArgs(argv);
     if (!isInteractive() && !options.provider && !options.intent) {
       console.error("Error: --intent and --provider required in non-interactive mode");
       process.exit(1);
     }
     const state = await gatherOptionsInteractively(options);
     const result = await runNegotiation(state);
     if (state.format === "json") outputJson(result);
     else outputTable(result);
     await saveLock(result);
   }
   ```

3. **Extract shared pack discovery logic.** Both `index.ts` and `connect.ts` have near-identical `findPacksDir()` and `loadProviderCard()` functions. Extract these into a shared utility before the negotiate extraction multiplies the duplication.

**Warning signs:**
- `index.ts` line count exceeds 1300 after adding interactive features
- New prompt helpers written inside the negotiate function rather than extracted
- The negotiate function uses local variables from the parent `index.ts` scope (currently it does not — it is fully self-contained)
- PR comment: "Maybe we should extract this to its own file in a follow-up"
- Test file adds tests for negotiate but they import from `index.ts` rather than a standalone module

**Phase to address:**
Phase 1 (scaffold interactive negotiation experience). Extraction is a prerequisite, not a follow-up. Do interactive flow in the extracted file, not in the monolithic function.

---

### Pitfall 3: LLM Stub Mode Produces Meaningless Output That Confuses Users

**What goes wrong:**
When no LLM API key is configured, the negotiator falls back to a deterministic stub that always returns:
```json
{
  "name": "negotiated-schema",
  "fields": [{ "name": "input", "type": "string", "required": true }]
}
```

The current CLI output presents this result identically to a real LLM-based negotiation — same table formatting, same `Schema ID: ...`, same "Verification: passed" message. A user who runs `synapse negotiate --intent chat --provider openai` for the first time will see a valid-looking output with a generated SDK, save a Schema Lock, and only later realize the schema is completely generic and useless.

With v5.0's interactive flow, this becomes more dangerous: the interactive wizard might present this stub schema to the user for customization. The user spends time editing a meaningless template instead of getting a meaningful AI-generated starting point.

**Why it happens:**
- The stub was designed as a development convenience so the pipeline could run without external dependencies. It was never intended for user-facing output.
- The `createDefaultLLMClient()` function returns a stub that silently degrades with no user-facing warning.
- The `negotiate()` function in CLI checks for a vault key (`negotiator-llm`) but falls to stub silently without any console.warn about the degradation.
- A first-time user has no reason to know they need a separate LLM key for negotiation — the concept of "negotiator-llm" as a distinct key name is unintuitive.

**How to avoid:**
1. **Detect stub output at the CLI layer.** Before rendering any result, check if the schema matches the stub signature (single `input` field, `string` type, required). If so, warn prominently:
   ```typescript
   if (result.schema.fields.length === 1 &&
       result.schema.fields[0].name === "input" &&
       result.schema.fields[0].type === "string") {
     console.warn("\nWarning: Negotiation used deterministic fallback (no LLM key configured).");
     console.warn("The resulting schema is a placeholder, not a meaningful negotiation.");
     console.warn("To configure an LLM key for real negotiation:");
     console.warn("  synapse vault set negotiator-llm <your-api-key>");
   }
   ```

2. **Surface the LLM provider used in the output.** The `NegotiationResult.schema` sometimes includes `llm_provider` in the current code but it is not consistently surfaced. Always show:
   ```
   LLM:          <provider> | <model> (or "deterministic stub" if no LLM)
   ```

3. **In interactive mode, check for LLM key first.** Before entering the interactive flow, check if a negotiator-llm key exists in the vault. If not, offer to configure one:
   - "No LLM key configured for negotiation. This means the schema will be generated using a basic deterministic fallback."
   - "1) Configure API key now  2) Continue with fallback  3) Cancel"
   - This is the single most impactful UX improvement for first-time users.

4. **Rethink the key name.** `negotiator-llm` is unintuitive. Consider `SYNAPSE_NEGOTIATOR_API_KEY` env var or a config path like `config negotiator.apiKey`. The vault key name should be documented in the interactive flow itself.

5. **Provide a meaningful non-LLM fallback.** The current stub is too minimal. A better stub could reverse-map from the provider's DSL-defined schema to generate a meaningful template even without an LLM:
   - Read the provider's `pack/<provider>/dsl/*.json` files
   - Extract required fields and their types
   - Generate a schema template from the Pack definition itself

**Warning signs:**
- New user runs `synapse negotiate --intent chat --provider openai` and sees a valid-looking 1-field schema
- No mention of "deterministic" or "stub" in the output
- User edits a meaningless schema in interactive mode, saves a lock, and only discovers the issue later
- The `NegotiateAndVerifyInput` has `llmOptions: undefined` but no warning is surfaced
- CLI test for negotiate always passes because the stub is deterministic (tests never validate against real LLM output)

**Phase to address:**
Phase 1 (scaffold interactive negotiation experience). The stub detection and warning must be in the initial interactive flow, not added as a follow-up. The interactive mode should handle "no LLM key" as a first-class state, not as an invisible fallback.

---

### Pitfall 4: Interactive Flow Becomes Blocking, Non-Skippable, and Confusing

**What goes wrong:**
The planned interactive negotiate flow for v5.0 has multiple steps: show input/output formats, indicate required fields, let user customize fields, confirm, generate SDK, suggest next steps. If each step blocks on user input, the flow becomes a multi-minute guided tour that users cannot skip or fast-forward through.

This is particularly dangerous for:
- **Experienced users** who know what they want and just need `--intent chat --provider openai --format json`
- **Scripting/AI** contexts where no human is present
- **Quick exploration** where the user wants to see if something works, not learn the full flow

The `connect.ts` already demonstrates a real example of this: the billing interactive prompt (`"Enable billing tracking? [Y/n]"`) blocks even when the user has already passed `--with-billing` or `--no-billing`. This is a minor issue now but would become a major one in a multi-step negotiate flow.

**Why it happens:**
- Developer's natural inclination: "The user is in interactive mode, so every decision needs user input."
- Failure to distinguish between "decisions the user MUST make" vs "decisions that have sensible defaults"
- No design principle for skippable steps — every prompt is equally blocking
- The v5.0 spec describes the ideal flow without explicitly defining what is skippable

**How to avoid:**
1. **Design for progressive disclosure, not linear wizard.** Each prompt should be skippable:

   ```
   Step 1: Review input fields for "chat" intent on "openai" (Press Enter to accept)
     - messages: array (required)
     - model: string (optional, "deepseek-chat")
   
   > [Enter to accept, or type field name to edit, or "done"]
   ```

   Users who want defaults press Enter three times and are done. Users who want granular control can edit each field.

2. **Classify every prompt into a tier:**

   | Tier | Behavior | Example |
   |------|----------|---------|
   | **Required** | Must answer, cannot proceed without | Provider selection when none specified |
   | **Recommended** | Has sensible default, press Enter to skip | Field acceptance, billing config |
   | **Contextual** | Only shown when relevant | LLM key setup on first run |
   | **Confirmation** | `--yes` flag can skip | Schema Lock overwrite warning |

3. **Implement `--yes` flag for all prompts.** Pattern from `pack.ts` and `evolve.ts`: when `--yes` is set, use all defaults without prompting. This is the "I know what I'm doing" escape hatch.

4. **Implement `--dry-run` for negotiation.** Show what the negotiation result would look like without saving the lock. Let the user inspect the output, then re-run without `--dry-run` to save.

5. **Detect previous knowledge.** If the user has already run `synapse setup`, the interactive negotiate flow should skip "configure your first provider" and assume context is known. Store `config.setup_completed` or check for existing vault keys.

6. **Keep the imperative path fully functional.** The command `synapse negotiate --intent chat --provider openai --format json` should produce JSON output with zero interaction, just as it does today.

**Warning signs:**
- Interactive mode has no "skip" or "done" option — every step blocks
- Pressing Enter on a required prompt causes an error instead of using a sensible default
- `--yes` flag is not documented in `--help` for negotiate
- Interactive flow takes more than 30 seconds for a knowledgeable user
- PR adds `rl.question(...)` without checking if all info was already provided via flags
- User needs to press Ctrl+C to escape the flow

**Phase to address:**
Phase 1 (interactive flow design). The skippable/blocking classification must be part of the initial interactive flow design, not a Phase 2 optimization. Every prompt should have `[default]` shown and an empty answer = accept default.

---

### Pitfall 5: Command Structure Fragmenting — Users Can't Find the Right Command

**What goes wrong:**
The CLI currently has 20 top-level commands: `connect, smoke, setup, config, billing, provider, generate, vault, negotiate, lock, sdk, pack, evolve, route, init, watchdog, profile, export, import, help`. The v5.0 plan adds interactive features across multiple commands:
- `synapse negotiate` gets interactive field editing
- `synapse evolve` already has `--tune` that re-negotiates
- `synapse connect` already has interactive provider/intent selection
- `synapse setup` is an interactive wizard

A new user has no way to know:
- Should I run `synapse setup` or `synapse negotiate` first?
- Which command generates the SDK: `synapse sdk generate` or `synapse evolve`?
- Is `synapse connect` the same as using the generated SDK?
- Why does `synapse evolve` also negotiate?

The "negotiation memory" system (markdown-based, part of v5.0 plan) adds another layer: if the user's prior negotiation choices are stored, how do they know where to find them? Which command reads the memory?

Each new command or interactive mode increases the "surface area" the user must understand. With 20 commands already, adding more sub-modes within commands without consolidating first will make the CLI feel like a sprawling tool rather than a focused developer utility.

**Why it happens:**
- Each capability was added independently with its own command (`synapse billing`, `synapse lock`, `synapse pack`). This was correct for modularity.
- The "interactive" layer is being added on top without consolidating the underlying commands.
- No explicit decision on which commands should be "user-facing" vs "power-user/low-level" — all 20 appear equally in `--help`.
- The existing help output lists all 20 commands in alphabetical order with no grouping, making it impossible to distinguish entry points from utilities.

**How to avoid:**
1. **Group `--help` output into categories.** Current flat list of 20 commands is already overwhelming. Categorize:

   ```
   Getting Started:
     setup         Interactive first-time setup wizard
   
   Core Workflow:
     negotiate     Run schema negotiation (interactive)
     evolve        Generate zero-dependency SDK
     connect       Connect to a provider and execute
   
   Provider Management:
     provider      List and inspect provider packs
     pack          Manage provider packs from Registry
   
   Configuration:
     config        Manage settings
     vault         Manage API keys
     billing       Manage billing configuration
   
   Advanced:
     lock          Manage Schema Locks
     sdk           Generate SDK from single Pack (low-level)
     route         Route to best provider (scoring)
     ...
   ```

2. **Establish a clear "user journey" hierarchy:**
   - **Entry commands** (`setup`, `negotiate`, `evolve`, `connect`) — these are what users should use day-to-day
   - **Utility commands** (`pack`, `vault`, `billing`, `config`) — these support the entry commands
   - **Advanced commands** (`lock`, `sdk`, `route`, `smoke`, `watchdog`, `profile`, `export`, `import`) — niche or debugging use cases

3. **Consider merging `sdk generate` into `evolve`.** The `evolve` command already does what `sdk generate` does but with Pack discovery, Profile injection, and strategy tuning. Having both creates confusion. Either make `evolve` the primary and hide `sdk` from help, or cross-document them clearly.

4. **Negotiate should be the entry point for interactive work.** If a user runs `synapse negotiate` interactively, the command should:
   - Check if LLM key is configured (if not, offer to set up)
   - Detect if packs are installed (if not, suggest `synapse pack add`)
   - Guide the user through the negotiation flow
   - End with next-step suggestions: "Generate SDK: `synapse evolve` | Test the connection: `synapse connect <provider> <intent>`"
   
   This makes `synapse negotiate` the "hub" command and reduces the need for users to memorize the full command tree.

5. **Add `synapse quickstart` or `synapse tutorial` as a guided tour.** Instead of making `negotiate` handle both exploration AND production use, provide a separate learning path.

**Warning signs:**
- `--help` output exceeds 40 lines (it already does — currently ~50+ lines)
- New commands or flags added without corresponding help group restructuring
- PR adds a user-facing feature to a command whose name does not clearly communicate its purpose
- Users ask "what's the difference between `evolve` and `sdk generate`?" repeatedly
- Interactive mode in `negotiate` duplicates functionality from `setup` without cross-linking

**Phase to address:**
Phase 1 (help system restructuring). The help grouping should be done BEFORE the interactive negotiate flow is designed, so the renamed/reorganized commands have consistent interactive behavior. However, command merging is Phase 2 — the help grouping is a quick structural change that informs everything else.

---

### Pitfall 6: Negotiation Memory / Schema Lock Becomes a "Write-Only" Black Hole

**What goes wrong:**
The v5.0 plan introduces "negotiation memory" (markdown files storing negotiation history). Combined with the existing Schema Lock system (immutable locks stored in `~/.synapse/schemas/`), the project now has two persistence layers:

1. **Schema Lock** (`getOrCreateLock`) — binary-ish JSON, auto-created, immutable, stored at `~/.synapse/schemas/`
2. **Negotiation Memory** (markdown) — human-readable, manually reviewed, stored at `.synapse/negotiations/`

Users can generate locks via `synapse negotiate`, view them via `synapse lock list`, and see outdated ones via `synapse lock outdated`. But:
- Which lock corresponds to which negotiation session?
- How does a user clean up orphaned locks from testing?
- How does a user roll back to a previous negotiation choice?
- How does a user know what they chose last week and why?

When "negotiation memory" is opaque, users stop trusting it. They delete everything and start over, defeating the purpose of versioned, persistent negotiation.

**Why it happens:**
- Schema Lock was designed as a technical artifact (like `package-lock.json`), not a user-facing history.
- The "negotiation memory" came as a separate feature requirement without considering how it relates to existing lock storage.
- No unified "show me what conclusions were made during negotiation" command exists.
- The current UX has no way to view the reasoning behind a lock — just the lock's field mappings.

**How to avoid:**
1. **Link negotiation memory to Schema Lock.** Each lock should reference its negotiation session ID or markdown file path. The counterpart: `synapse lock show <id>` should include a link to the negotiation memory doc.

2. **Add `synapse negotiate --history` or `synapse negotiate --show <session>`** to view past negotiation sessions and their resulting locks.

3. **Make lock deletion safe and discoverable.** Currently `synapse lock remove` exists but is not mentioned in the negotiate help. After each interactive negotiation, show:
   ```
   Lock saved: chat_openai_abc123 (cached)
   View lock:       synapse lock show chat_openai_abc123
   List all locks:  synapse lock list
   Remove this:     synapse lock remove chat_openai_abc123
   ```

4. **Implement lock diffing.** When a user re-negotiates and the result differs from an existing lock, show a diff:
   ```
   Schema Lock changed:
     + field: max_tokens (number)
     - field: temperature (number, was optional)
   Save new lock? [Y/n]:
   ```

5. **Document the "reset to clean slate" path.** If a user wants to clear all negotiation state, the path should be:
   ```
   synapse lock remove --all    # Clear all locks
   # or, for nuclear option:
   rm -rf ~/.synapse/schemas/   # Clear locks and verification cache
   ```
   Document this in `--help` or in a troubleshooting guide.

**Warning signs:**
- User asks: "I ran negotiate last week and picked some fields, how do I see what I picked?"
- User runs `synapse lock list` and sees locks with no context they can understand
- PR adds negotiation memory but does not modify `synapse lock show` to display the link
- `synapse lock outdated` produces results but the user has no way to understand what changed
- No command to compare two locks or view a lock's history

**Phase to address:**
Phase 2 (negotiation memory integration). The first phase of interactive negotiate should NOT include memory persistence — it should succeed at the basic interactive flow first. Phase 2 adds the memory link and lock diffing.

---

### Pitfall 7: Interactive Field Editing Has No "Preview Diff" or Undo

**What goes wrong:**
The interactive negotiate flow allows users to customize fields: add fields, remove fields, rename fields, change required/optional status. Once the user confirms:
1. A new Schema Lock is created
2. The negotiation is marked as "resolved"
3. The SDK is generated from this lock

If the user makes a mistake — accidentally removes a required field, adds a duplicate, changes a type — there is no undo. The lock is written. The previous lock is overwritten (or becomes stale). The user cannot easily see what changed between their previous state and the new state.

This is especially dangerous because:
- The interactive mode makes editing feel low-stakes (just typing)
- The Schema Lock is immutable by design (no `synapse lock edit` exists)
- Reverting requires running `synapse lock migrate` (an advanced command most users won't discover)
- There is no "are you sure?" summary before the lock is written

**Why it happens:**
- Schema Lock immutability was a deliberate design choice (similar to `package-lock.json`). It prevents silent drift. But it also prevents easy rollback.
- The interactive editing flow is designed as "steps with confirmation" but the final confirmation step lacks a diff preview.
- No existing infrastructure for diffing two Schema Locks exists.
- The codebase has `matchManifest` for comparing schemas to manifests, but no `diffLocks` utility.

**How to avoid:**
1. **Implement a `diffLocks` utility** before interactive editing ships:
   ```typescript
   function diffLocks(old: SchemaLock, updated: Partial<SchemaLock>): LockDiff {
     // Returns added/removed/changed fields
   }
   ```

2. **In the interactive flow, after all edits, show a diff preview:**
   ```
   ---- Changes to Schema Lock --------------------------
     + messages[].role: string (required)
     - max_tokens: number
     ~ model: string -> "deepseek-chat" (default changed)
   
   Accept these changes? [Y/n]:
   ```

3. **Save to a new lock ID instead of overwriting.** The existing `getOrCreateLock` already handles this: it creates a new lock when the schema changes. But the CLI auto-saves without asking. Add a confirmation step before writing, with `--yes` to auto-confirm.

4. **Keep the last 3 locks per (intent, provider) pair.** This gives users an escape hatch: `synapse lock list` shows recent locks and their timestamps. `synapse lock show <lock-id>` shows details.

5. **If the old lock was cached (not user-modified), warn before overwriting.** There is a meaningful difference between "the previous lock was auto-generated" vs "the previous lock was manually customized in interactive mode."

**Warning signs:**
- Interactive field editing flow ends immediately with "Lock saved" — no diff preview
- User modifies fields, accidentally breaks something, and cannot revert
- No utility function exists to compare two Schema Locks
- The `getOrCreateLock` is called with no user-facing summary of what will change
- User must manually delete `~/.synapse/schemas/` to recover from a bad lock

**Phase to address:**
Phase 2 (field customization in interactive flow). The initial interactive flow should focus on "review and accept" (read-only). Field editing comes in Phase 2, and diff preview MUST be part of that Phase 2, not an afterthought.

---

### Pitfall 8: `negotiator-llm` Key Discovery Failure — Users Can't Configure the Negotiator

**What goes wrong:**
To use the real LLM-based negotiation, users must:
1. Store an API key with the name `negotiator-llm`: `synapse vault set negotiator-llm <key>`
2. Know that this key is DIFFERENT from the provider API key (e.g., `synapse vault set deepseek <key>`)
3. Optionally configure model and baseUrl: `synapse config set negotiator.model gpt-4o` / `synapse config set negotiator.baseUrl ...`

These steps are not discoverable. The existing `negotiate` function's help output does not mention the LLM key requirement. When the user runs `synapse negotiate --intent chat --provider openai`, it works (with stub output) — giving no indication that a better result is available.

With v5.0's interactive mode, this becomes a critical failure: the interactive flow should be the place where users discover and configure the negotiator, but if the setup path is undocumented, they will never find it.

The vault key name `negotiator-llm` is also confusing: it is not a provider name, not a recognizable service. Users naturally try `synapse vault set negotiator`, `synapse vault set llm`, or just skip vault entirely and assume the OPENAI_API_KEY env var (which the negotiator DOES check in `createDefaultLLMClient()` but the CLI does not surface).

**Why it happens:**
- The negotiation pipeline was designed to be gracefully degradable (no key = stub). This is technically correct but UX-harmful.
- The vault key name was chosen for internal clarity ("this is the LLM key for the negotiator") without considering user discoverability.
- The CLI help text focuses on the "what" (flags) rather than the "prerequisites" (setup steps).
- The `setup` command only configures provider keys, not the negotiator key.

**How to avoid:**
1. **In the interactive negotiate flow, check for the LLM key FIRST.** Before any negotiation step, check vault and env var. If no key, offer to configure now or continue with stub.

2. **Consolidate key sourcing.** The negotiator should check in order:
   1. Explicit `--negotiator-api-key` flag (new flag for negotiate command)
   2. `config.negotiator.apiKey` (from config)
   3. Vault key `negotiator-llm`
   4. `OPENAI_API_KEY` env var
   5. Provider's own vault key as fallback (if it is an OpenAI-compatible provider)
   
   This gives users multiple paths to configure without needing to memorize `negotiator-llm`.

3. **Add `--negotiator-api-key` and `--negotiator-model` flags to `synapse negotiate`.** This enables CI/scripting use without vault setup.

4. **Update `synapse setup` to optionally configure the negotiator key.** After setting up the provider, ask: "Do you also want to configure an LLM key for schema negotiation? This enables AI-powered negotiation." This makes the negotiator LLM key a first-class setup concern.

5. **Document the LLM requirement in `--help`:**
   ```
   Prerequisites:
     An LLM API key for schema negotiation.
     Configure: synapse vault set negotiator-llm <your-key>
     Or set env: OPENAI_API_KEY=...
   ```

**Warning signs:**
- User runs `synapse negotiate` interactively, gets a stub output, and does not realize a better result is possible
- No mention of "LLM key" or "negotiation key" in the interactive flow
- The vault key name `negotiator-llm` appears only in source code, not in help text or docs
- `synapse setup` completes without mentioning the negotiator configuration
- Users store their provider key and expect the negotiator to use it (reasonable assumption, currently wrong)

**Phase to address:**
Phase 1 (LLM key discovery). The interactive flow MUST surface the LLM key requirement from the first interaction. If this waits until Phase 2, users will form the incorrect expectation that the stub output is the product's full capability.

---

### Pitfall 9: Interactive Help Becomes a Separate, Unmaintained Documentation Surface

**What goes wrong:**
The interactive negotiation flow includes in-context help text: field descriptions, type explanations, next-step suggestions, prerequisite checks. This help text is hardcoded as `console.log()` strings within the command handler. When the underlying system changes (new field types, renamed intents, changed configuration paths), the help text goes stale because:
- It is invisible to automated documentation generation (no TypeDoc, no extracted strings)
- It is mixed with business logic — changing behavior may produce incorrect help text
- The help text is duplicated from `--help` output and the docs site, creating three independent surfaces to maintain

**Why it happens:**
- In interactive mode, in-context help is critically important (users cannot see `--help` while in a prompt)
- The quickest way to add help text is `console.log("...")`
- The project has no documentation extraction or i18n infrastructure
- The existing `--help` system (one `printXHelp()` function per command) is already separate from the docs site content

**How to avoid:**
1. **Extract help text into a single source of truth.** Define help content as data, not inline strings:
   ```typescript
   const NEGOTIATE_HELP = {
     prerequisites: "An LLM API key for schema negotiation. Configure with: synapse vault set negotiator-llm <key>",
     fieldDescription: (field: FieldDef) =>
       `${field.name}: ${field.type}${field.required ? " (required)" : " (optional)"}`,
     nextSteps: (provider: string, intent: string) => [
       `Test:  synapse connect ${provider} ${intent}`,
       `Generate SDK: synapse evolve --provider ${provider}`,
     ],
   } as const;
   ```

2. **Share strings between `printNegotiateHelp()` and interactive flow.** Both should reference the same help content. If a flag changes, both surfaces update automatically.

3. **Audit existing help text for single-sourcing gaps.** The current `printNegotiateHelp()` function (index.ts lines 232-258) has useful information about the negotiator's capabilities. The interactive flow should reference the same information rather than rephrasing it.

4. **Consider using the `help` command as the backup for in-context help.** In interactive mode, if the user types `help` or `?`, show the command's `--help` output. This creates continuity between interactive and non-interactive modes.

**Warning signs:**
- Interactive flow prints "see synapse X --help for more info" — the user is in the middle of an interactive flow, they cannot see help output
- Help text in interactive mode mentions a flag or option that no longer exists
- PR that adds a new flag to `synapse negotiate` does not update the interactive help text
- Hardcoded strings contain provider names or intent names that could become stale
- The `--help` output and interactive help text disagree on the number of steps or available options

**Phase to address:**
Phase 2 (help text consolidation). The initial interactive flow can use inline strings, but they must be extracted into a shared structure before the milestone ships. Phase 1 should design the string extraction pattern; Phase 2 implements it for all commands.

---

### Pitfall 10: Schema Lock Auto-Save Becomes Silent — Users Lose Control of Persistence

**What goes wrong:**
The current `synapse negotiate --intent chat --provider openai` flow auto-saves a Schema Lock to `~/.synapse/schemas/` without asking. It prints:
```
  Lock:         chat_openai_abc123 (created)
```

This happens regardless of:
- Whether the user wants this lock saved
- Whether a previous lock with the same (intent, provider) exists and will be shadowed
- Whether the negotiated schema is actually useful (stub case)
- Whether the user ran negotiate just to explore

With v5.0's interactive mode, this auto-save behavior is even worse: the user spent time in an interactive flow, made choices, and THEIR lock is auto-saved. But if the user was "just looking," the auto-save creates friction (they need to manually `synapse lock remove` later). If the user was experimenting, each experiment creates a new lock (the immutable design generates unique lock IDs), and the old lock becomes orphaned — never deleted, never updated, just... there.

**Why it happens:**
- The auto-save was designed for the SDK generation pipeline (`synapse evolve` reads locks). Making it opt-in would break the pipeline flow.
- The current flow treats negotiation and saving as inseparable: "you negotiated, so a lock was created."
- No distinction is made between "exploratory negotiation" (user testing what happens) and "committed negotiation" (user finalized a choice).

**How to avoid:**
1. **Add `--dry-run` flag to `synapse negotiate`.** When set, run the full negotiation pipeline, render output, but do NOT save the lock. This lets users explore without side effects:
   ```
   synapse negotiate --intent chat --provider openai --dry-run
   ```

2. **In interactive mode, ask before saving:**
   ```
   ---- Negotiation Complete ----------------------------
   Schema: chat_response (4 fields)
   Provider: openai
   
   Save this Schema Lock? [Y/n]:
   ```

3. **Distinguish "created" vs "overwrites existing" in the save prompt.** If a lock already exists for the same (intent, provider) pair, show:
   ```
   ---- Existing Lock Found ------------------------------
   Old: chat_openai_def456 (created 2026-05-20)
   New: chat_openai_ghi789 (current negotiation)
   
   Overwrite existing lock? [y/N]:
   ```

4. **Add `--no-save` flag** as the non-interactive equivalent of answering "n" to the save prompt. This makes scripting deterministic.

**Warning signs:**
- `synapse negotiate --intent chat --provider openai` writes files without asking
- `synapse lock list` shows multiple locks for the same (intent, provider) with similar timestamps
- User asks "how do I stop locks from being created?" or "which lock is active?"
- No way to run negotiate in "read-only" mode
- The `--dry-run` flag is absent from negotiate (it exists in evolve.ts already as a pattern)

**Phase to address:**
Phase 1 (auto-save control). The `--dry-run` flag and save confirmation are part of the initial interactive flow. Deferring this creates a persistence model that treats all negotiations as equally committed.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Negotiate in `index.ts` (no extracted command file) | Fast to iterate, no import refactoring | 300+ lines in a 1250-line file; hard to test; extraction becomes riskier as features grow | NEVER. Extraction must precede interactive features. |
| Readline inline (no shared TTY helper) | Fast prototyping, no abstraction overhead | Every interactive command needs its own TTY guard; one missed guard = CI hang | For single interactive command ONLY. Must extract before second command adds prompts. |
| Inline help strings (no extraction) | Fast to write, no string management | Three help surfaces (CLI help, interactive help, docs site) diverge | For MVP interactive flow. Must extract before milestone ships. |
| Stub negotiation output (no warning) | Works without API key, simple to test | Users get meaningless schemas without realizing it | NEVER for user-facing output. Acceptable for development-only environments. |
| Auto-save lock without confirmation | Simple pipeline (negotiate to always save) | Users lose control of persistence; exploratory runs create orphaned locks | For batch/CI mode only. NEVER for interactive mode. |
| `negotiator-llm` as undiscoverable key name | Clean separation from provider keys | Users do not know to configure it; first-run experience is stub-by-default | Acceptable temporarily IF the interactive flow surfaces and automates the setup. |
| ad-hoc pack discovery in multiple files | No shared module needed initially | Three copies of `findPacksDir` + `loadProviderCard` (index.ts, connect.ts, index.ts negotiate) | Acceptable before command extraction. Extract during negotiate.ts creation. |
| Process stdout.write suppression for hidden input | Works for password entry in setup.ts | Fragile pattern; may break in non-standard terminals | For setup.ts only (sensitive input). Do not replicate in negotiate.ts. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Negotiate + vault (`negotiator-llm` key) | Assuming provider key works for negotiation | Check vault key `negotiator-llm` explicitly; fall back to provider key or env var |
| Negotiate + Schema Lock (auto-save) | Auto-saving every negotiation result | Add `--dry-run` flag; confirm in interactive mode |
| Interactive flow + non-TTY (CI/pipe) | Adding prompts without TTY guard | Always check `isInteractive()` before any prompt |
| Interactive flow + Shell piping | Piping answers fails on prompt order changes | Support input via `--input`, `--format json`, not stdin pipe for multi-step |
| Help text + docs site | Keeping three copies of help content (CLI help, interactive help, docs) | Extract help content to shared definitions; auto-generate docs from source |
| Negotiation memory + Schema Lock | Two persistence layers with no cross-reference | Each lock stores session ID; `lock show` includes memory link |
| `synapse evolve` + `synapse negotiate` | Both command and interactive flow do negotiation, confusing users | `negotiate` = interactive exploration; `evolve` = batch production generation. Document clearly. |
| Lock diffing + interactive editing | No lock diff utility before editing goes in | Implement `diffLocks` before the first interactive field edit |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Interactive prompts in CI/pipe | CLI hangs forever waiting for stdin | TTY guard + fail-fast with non-zero exit | First non-TTY usage |
| Multi-step interactive flow (5+ steps) | User abandons workflow; repeated `synapse negotiate` runs | Every step must be skippable via `--yes` + sensible defaults | User expects quick answer |
| Stub negotiation on first run | User sees meaningless schema, assumes tool is broken | Flag stub output prominently + guide to LLM key setup | First user interaction |
| Many orphaned Schema Locks | `synapse lock list` shows 20+ locks with no context | Auto-save confirmation; periodic cleanup suggestion | After 5+ exploratory negotiate runs |
| `process.stdout.write` suppression for hidden input | Password input breaks in VS Code terminal or tmux | Test hidden input in all target terminal environments | Non-standard terminal environments |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing API key in interactive negotiation output | Key appears in terminal scrollback or CI logs | Always redact keys in output; confirm before showing any keys |
| Printing LLM negotiation prompts to console | Sensitive user intent data in logs | Negotiation prompts are debug-level; never log to stdout in normal mode |
| Interactive password input breaks in CI (no TTY) | User thinks they entered a key but it was not captured | TTY guard prevents non-TTY interactive input entirely |
| Schema Lock files containing field mappings that leak internal logic | If `~/.synapse/` is committed to Git by accident | Add `~/.synapse/` to `.gitignore` in `synapse init`; warn in lock output |
| Storing LLM key under the name `negotiator-llm` | Users may store their primary provider key here instead of the intended LLM key | Validate key prefix or format; suggest distinct provisioning |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Interactive flow has no progress indicator | User does not know how many steps remain | Show "Step 2/4: Review fields" header |
| Interactive flow requires typing JSON in a readline prompt | Error-prone; one syntax error and user must restart | Accept JSON from `--input` flag; use a file path; validate and retry |
| `Ctrl+C` leaves CLI in inconsistent state (lock partially saved) | Partial writes; confusion on re-run | Handle SIGINT: cleanup partial state, print "Cancelled" message |
| Interactive field editor shows raw type names (`string`, `enum`) | Non-technical users do not know what types mean | Show descriptive labels: "Text", "Choice from list", "Number" |
| Help text says "press Enter to accept default" but some steps have no default | User stuck on a required prompt | Every step must have a sensible default or a clear "exit"/"skip" path |
| `synapse negotiate` without any arguments enters interactive mode | Scripting user gets stuck | Without TTY: fail with "use --intent and --provider". With TTY: enter interactive mode. |
| Interactive mode shows all providers when no provider selected | Overwhelming for 15+ installed packs | Filter by intent first, then show matching providers only |

## "Looks Done But Is Not" Checklist

- [ ] **TTY detection**: No shared `isInteractive()` helper exists — verify one is created and used by every interactive prompt
- [ ] **Command extraction**: `negotiate()` is still in `index.ts` — verify extracted to `src/commands/negotiate.ts` with `handleNegotiateCommand(argv)` and `printNegotiateHelp()`
- [ ] **Stub detection**: No `llm_provider` or "deterministic stub" label in negotiate output — verify stub output is clearly flagged
- [ ] **LLM key discovery**: No mention of `negotiator-llm` in interactive flow help — verify first-run detection and guided setup
- [ ] **`--yes` flag**: No `--yes` flag exists for `synapse negotiate` — verify it exists and bypasses all confirmations
- [ ] **`--dry-run` flag**: No `--dry-run` prevents lock auto-save — verify it exists for exploratory runs
- [ ] **Help grouping**: CLI help still shows 20 commands in flat alphabetical list — verify grouped by category
- [ ] **Lock diff preview**: No lock diff shown before overwrite — verify diff is displayed in interactive mode
- [ ] **Auto-save confirmation**: Schema Lock auto-saved without asking in interactive mode — verify confirmation prompt exists
- [ ] **Non-blocking flow**: Interactive flow has steps that block without defaults — verify every prompt has `[default]` and empty-Enter accepts default
- [ ] **Ctrl+C handling**: SIGINT is unhandled in interactive mode — verify cleanup handler on interrupt

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Interactive prompts hang in CI (no TTY guard) | LOW — add TTY guard to each prompt site | 1. Create `isInteractive()` helper. 2. Guard every `rl.question()` call. 3. Fail with actionable message + non-zero exit. |
| Stub lock saved as real lock | LOW — detect and remove | 1. `synapse lock remove <id>`. 2. Configure LLM key. 3. Re-negotiate with `--no-cache`. |
| Bad interactive field edit produced wrong lock | MEDIUM — need to revert | 1. `synapse lock list` to see recent locks. 2. `synapse lock show <previous-id>` to verify. 3. If no previous, re-negotiate. 4. Lock diff during negotiation would have prevented this. |
| Orphaned lock accumulation | LOW — cleanup | 1. `synapse lock list` to audit. 2. `synapse lock remove <id>` for each unwanted lock. 3. Periodically: `rm -rf ~/.synapse/schemas/` and regenerate. |
| User cannot find the right command | MEDIUM — restructure help | 1. Group help output. 2. Add cross-references between related commands. 3. Consider merging `sdk` into `evolve`. |
| Interactive help text gone stale | MEDIUM — audit all strings | 1. Extract strings to shared definitions. 2. Add CI check: help text vs current flags. 3. Verify interactive flow references extracted, not inline, strings. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| P1: No TTY detection | Phase 1 (scaffold) | `isInteractive()` helper exists; every interactive prompt guarded; CI tests with piped stdin |
| P2: Monolithic index.ts | Phase 1 (scaffold) | `negotiate` function extracted to `src/commands/negotiate.ts`; shared pack discovery extracted |
| P3: LLM stub output confusion | Phase 1 (scaffold) | Stub output is flagged; interactive flow guides LLM key setup; non-LLM fallback improved |
| P4: Blocking non-skippable flow | Phase 1 (interactive flow design) | Every prompt has default; `--yes` bypasses all; `--dry-run` works; imperative path preserved |
| P5: Command structure fragmentation | Phase 1 (help system) | Help grouped; cross-references between commands; negotiate as "hub" command |
| P6: Negotiation memory as black hole | Phase 2 (memory integration) | Lock references session; `lock show` includes memory link; lock diffing exists |
| P7: No preview/undo for field editing | Phase 2 (field customization) | `diffLocks` utility exists; diff preview shown; save confirmation with changes summary |
| P8: `negotiator-llm` key discovery failure | Phase 1 (LLM key discovery) | Interactive flow detects missing key; offers to configure; multiple key sourcing paths |
| P9: Stale interactive help text | Phase 2 (help consolidation) | Help strings extracted to shared definitions; help sources verified against flag set |
| P10: Silent auto-save of locks | Phase 1 (auto-save control) | `--dry-run` flag exists; save confirmation in interactive mode; `--no-save` flag exists |

## Sources

- **clig.dev — Command Line Interface Guidelines**: https://clig.dev -- Industry-standard CLI design principles. (HIGH confidence)
- **PatternFly CLI Handbook**: https://www.patternfly.org/developer-resources/cli-handbook/ -- Accessibility and UX patterns for CLI tools. (HIGH confidence)
- **10 Agent-Friendly CLI Design Principles (Eric Zakariasson, Cursor)**: https://en.theblockbeats.news/flash/338249 -- Eliminate interactive prompts for AI agents; prefer flag-passing; fail fast with actionable errors. (HIGH confidence)
- **dotnet/dev-proxy TTY detection fix**: https://github.com/dotnet/dev-proxy/issues/1536 -- Interactive prompts hanging CI when no TTY detected. (LOW confidence -- single source, but matches multiple project patterns)
- **openclaw/crestodian non-TTY exit code bug**: https://github.com/openclaw/openclaw/issues/73646 -- Exiting with code 0 on non-TTY error, breaking CI pipelines. (MEDIUM confidence -- verified via PR #74059 fix)
- **git-std TTY detection**: https://github.com/driftsys/git-std/issues/201 -- Guard interactive prompts with TTY check; fail with actionable error messages. (MEDIUM confidence)
- **proofkit CI env var detection**: https://github.com/proofsh/proofkit/issues/185 -- Combined TTY + CI env var detection for robust interactive mode determination. (MEDIUM confidence)
- **Codebase analysis -- current CLI**: `apps/cli/src/index.ts` (1248 lines), `apps/cli/src/commands/connect.ts` (795 lines, readline interactive patterns), `apps/cli/src/commands/setup.ts` (313 lines, readline + hidden input patterns), `apps/cli/src/commands/pack.ts` (existing `--yes` flag), `apps/cli/src/index.test.ts` (253 lines, no TTY tests). (HIGH confidence)
- **Codebase analysis -- negotiator stub**: `packages/negotiator/src/index.ts` -- `createDefaultLLMClient()` returns stub `{ name: "negotiated-schema", fields: [{ name: "input", type: "string", required: true }] }`. (HIGH confidence)
- **Codebase analysis -- negotiate function**: `apps/cli/src/index.ts` lines 678-986 -- 308-line function with flag parsing, pack discovery, LLM key loading, pipeline execution, formatted output, lock auto-save, and error handling. (HIGH confidence)
- **Node.js readline pitfalls**: `node:readline` keeps the process alive; `createInterface` creates a duplex stream; must call `rl.close()`. (HIGH confidence -- Node.js documentation)
- **Bun readline close bug**: https://github.com/oven-sh/bun/issues/3604 -- `rl.close()` may not properly terminate the stream in Bun. (MEDIUM confidence)
- **Breakdown of TTY detection in pseudo-TTY environments (VS Code, AI agents)**: https://github.com/anthropics/claude-code/issues/13528 -- VS Code integrated terminal has pseudo-TTY limitations. (MEDIUM confidence)

---
*Pitfalls research for: v5.0 Interactive Negotiation & Experience Optimization -- adding interactive Schema negotiation flow, command simplification, and streamlined user journey*
*Researched: 2026-05-25*
