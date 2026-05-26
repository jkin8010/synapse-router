---
sidebar_position: 4
title: synapse negotiate
---

# synapse negotiate — Schema Negotiation

The `negotiate` command matches the Agent's intent to a Provider's Feature capabilities and creates a **Schema Lock** — a frozen Schema Contract that defines field mappings between the Agent's requirements and the Provider's API. This is the core of the "negotiate at development time, zero overhead at runtime" principle.

Schema Locks are cached in `~/.synapse/schemas/` and are automatically reused on subsequent calls. They remain immutable until explicitly invalidated, ensuring deterministic behavior.

## Negotiation Timing

Schema negotiation happens at the following points in the workflow:

| Trigger | Timing | Description |
|---------|--------|-------------|
| `synapse negotiate` (no arguments) | Explicit, interactive | Full interactive negotiation in TTY terminal |
| `synapse negotiate --intent <x> --provider <y>` | Explicit, non-interactive | Manually trigger negotiation and view detailed lock information |
| `synapse connect <x> <y>` | Implicit (first call) | If no cached Schema Lock exists, negotiation runs automatically |
| `synapse connect <x> <y> --no-cache` | Implicit (forced) | Forces re-negotiation even if a valid cached lock exists |
| `synapse evolve --tune` | Batch | Re-negotiates all Schema Locks during batch SDK generation |

## Interactive Mode

Running `synapse negotiate` without any arguments in a TTY terminal launches an interactive 8-step flow. In a non-TTY environment (piped, CI), the command prints an error and exits with code 1 — use `--intent` and `--provider` for scripting.

### Interactive Flow

**Step 1 — Select Intent**

Uses `promptSearch` to scan all installed Provider Packs (built-in packs, local `.synapse/packs/`, and user `~/.synapse/packs/`) for unique intent values. Type to filter the list with case-insensitive matching.

```
? Select an intent (type to filter):
  chat
  embeddings
  text-to-image
  speech-to-text
```

*Tier: required — user must select an intent, no default.*

**Step 2 — Select Provider**

After selecting an intent, only providers supporting that intent are shown. Uses `promptSelect` with a filtered list:

```
? Select a provider for "chat":
  deepseek — DeepSeek
  openai — OpenAI
  groq — Groq
```

*Tier: required — user must select a provider, no default.*

**Step 3 — View Feature Schema**

The provider card and matching feature are loaded. The schema table is displayed with color-coded field markers:

- **Green `[required]`** — mandatory fields
- **Yellow `[optional]`** — optional fields
- Enum values shown in curly braces

```
  Feature: Chat Completions
  No description

  Input Fields (5):
    messages : array    [required]
    model : string      [required]
    temperature : number [optional]
    max_tokens : number  [optional] {64|128|256|512|1024|2048}
    stream : boolean     [optional]

  Output Fields (3):
    id : string
    choices : array
    usage : object
```

**Step 4 — Field Selection**

Optional fields can be deselected via checkbox prompts. Required fields are locked (checked and disabled) and cannot be removed:

```
? Select input fields to include (required fields are locked):
  ❯◉ messages : array (required)     [locked]
   ◉ model : string (required)       [locked]
   ◉ temperature : number (optional)
   ◯ max_tokens : number (optional)
   ◉ stream : boolean (optional)
```

*Tier: recommended — Enter accepts all fields selected as default.*

**Step 5 — LLM Key Detection**

The negotiator checks for an LLM API key in three places, in order:

1. **Vault** — `synapse vault get negotiator-llm`
2. **Environment** — `OPENAI_API_KEY`
3. **Config** — `synapse config get negotiator.apiKey`

If no key is found, a warning banner is displayed and the user is asked whether to proceed with a deterministic stub:

```
⚠  No LLM API Key configured for negotiation.
  Without an LLM key, the schema will be generated using a deterministic stub.
  This produces a generic placeholder, not a real negotiation result.

  To configure an LLM key:
    synapse vault set negotiator-llm <your-api-key>
  Or set: export OPENAI_API_KEY=<your-key>

? Continue with deterministic stub? (Y/n)
```

*Tier: contextual — only shown when no LLM key is detected.*

**Step 6 — Lock Diff Preview**

Before saving, the negotiator compares any existing Schema Lock with the new negotiation result. Shows added fields (green), removed fields (red), or a "no field changes" message:

```
  Lock Diff Preview
  ==================================================
  Current lock:  chat_openai_v1.2.3_abc12345
    Created:     2026-05-20T10:30:00Z
    Fields:      5
  New negotiation:
    Schema:      chat_openai_v1.2.3_def67890
    Fields:      6
    + Added:     temperature, max_tokens
```

For first-time locks, a simple message is shown.

**Step 7 — Confirm Save**

```
? Save this Schema Lock? (Y/n) › Yes
```

If confirmed, the lock is persisted to `~/.synapse/schemas/`. If declined, a message suggests using `--dry-run` for preview-only mode.

*Tier: confirmation — Enter accepts default (yes).*

**Step 8 — Post-Negotiation Routing Menu**

After successful negotiation, a 5-option menu lets you choose the next action:

```
? Select an action:
  ❯ Test connection  (synapse connect)
    Generate SDK (synapse evolve)
    Show SDK integration code
    Open in Playground
    Save and exit
```

Each option displays the corresponding command or code snippet. Selecting "Test connection" shows a ready-to-run `synapse connect` command. Selecting "Generate SDK" shows a `synapse evolve` command. "Show SDK integration code" displays import and usage examples. "Open in Playground" opens the web Playground (<http://localhost:5173>) in your default browser:

```
  Run this command to test:
  synapse connect openai chat --input '{"...":"..."}'

  Add --billing preCall to track costs.
```

*Tier: confirmation — single selection, then returns.*

### Interruption Handling

- **SIGINT/SIGTERM**: Cleanup handler registered at start, removed at end. Double-trigger prevention via an `interrupted` flag. Exit code 130. No orphan lock files.
- **ExitPromptError**: `@inquirer/prompts` Ctrl+C handling is caught and routed to the cleanup handler.
- **Signal handler lifecycle**: Handlers are registered at function entry and removed at function exit.

### Prompt Tier Classification

Each prompt in the interactive flow is classified by tier:

| Tier | Purpose | Example |
|------|---------|---------|
| **Required** | Must provide a value, no default | Intent selection, provider selection |
| **Recommended** | Pre-filled with sensible defaults | Field selection (all fields checked) |
| **Contextual** | Only shown when relevant | LLM key warning banner |
| **Confirmation** | Yes/no with a default | Lock save confirmation, routing menu selection |

## Non-Interactive Mode

The command supports two non-interactive operation modes:

### Mode 1 — Schema File Scan

Scans all installed Provider Packs to find providers whose Features match the intents in an Agent Schema file:

```bash
synapse negotiate <schema-file>
```

**Example:**
```bash
synapse negotiate my-agent.json
# Matched providers:
#   openai: chat, text-to-image
#   deepseek: chat
#   stability: text-to-image
```

### Mode 2 — Intent + Provider (Schema Lock)

Negotiates a single intent/provider pair and creates (or retrieves cached) Schema Lock:

```bash
synapse negotiate --intent <intent> --provider <provider> [--no-cache]
```

**Parameters:**

| Parameter | Description |
|-----------|-------------|
| `--intent <intent>` | Intent type, e.g. `chat`, `text-to-image`, `embeddings` |
| `--provider <provider>` | Provider ID, e.g. `openai`, `deepseek` |
| `--no-cache` | Force re-negotiation, ignoring cached Schema Lock |

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--intent <intent>` | Feature intent (e.g. `chat`, `text-to-image`) | — |
| `--provider <provider>` | Provider ID (e.g. `openai`, `deepseek`) | — |
| `--no-cache` | Force re-negotiation (delete cached lock + re-verify) | `false` |
| `--format <fmt>` | Output format: `json` or `table` | `table` |
| `--yes` | Skip all prompts, accept default values | `false` |
| `--dry-run` | Run full pipeline, preview results, do not save Lock | `false` |
| `--no-save` | Negotiate successfully but do not save Schema Lock | `false` |
| `--no-interactive` | Force non-interactive mode (fail if info missing) | `false` |

## Output

### Cached Lock

When a cached lock exists (non-interactive mode):

```
Using cached lock: chat_openai_v1.2.3_abc12345
  Intent:    chat
  Provider:  openai
  Feature:   chat_post_v1_chat_completions
  Pack:      v1.2.3
  Input:     5 fields
  Output:    3 fields
  Mappings:  4 fields
```

### New Lock

When a new lock is created (or `--no-cache` forces re-negotiation):

```
Created new lock: chat_openai_v1.2.3_def67890
  Intent:    chat
  Provider:  openai
  Feature:   chat_post_v1_chat_completions
  Pack:      v1.2.3
  Input:     5 fields
  Output:    3 fields
  Mappings:  4 fields
```

### Stub Warning

When negotiating without an LLM API key, the generated schema is a deterministic placeholder:

```
⚠  Negotiation used deterministic stub (no LLM key configured).
  The resulting schema is a generic placeholder, not a real negotiation.
  To get a meaningful AI-generated schema, configure an LLM key.
```

### Lock Diff (Interactive Mode)

When an existing lock is being replaced:

```
  Lock Diff Preview
  ==================================================
  Current lock:  chat_openai_v1.2.3_abc12345
    Created:     2026-05-20T10:30:00Z
    Fields:      5
  New negotiation:
    Schema:      chat_openai_v1.2.3_def67890
    Fields:      6
    + Added:     temperature, max_tokens
```

## Examples

### Example 1 — Interactive negotiation

```bash
synapse negotiate
```

Starts the 8-step interactive flow. See the [Interactive Mode](#interactive-mode) section above for step-by-step details.

### Example 2 — Interactive with dry-run preview

```bash
synapse negotiate --dry-run
```

Runs the full interactive pipeline but does **not** save the Schema Lock at the confirmation step. Useful for exploring schemas without side effects.

### Example 3 — Explicit negotiation without caching

```bash
synapse negotiate --intent chat --provider deepseek --no-cache
# Removed cached lock: chat_deepseek_v1.0.0_abc
# Created new lock: chat_deepseek_v1.0.0_def
```

### Example 4 — Scan all providers for matching intents

```bash
synapse negotiate my-agent-schema.json
```

Where `my-agent-schema.json` contains:
```json
{
  "features": [
    { "intent": "chat" },
    { "intent": "text-to-image" }
  ]
}
```

### Example 5 — JSON output for scripting

```bash
synapse negotiate --intent chat --provider openai --format json
```

### Example 6 — Preview mode (dry run)

```bash
synapse negotiate --intent chat --provider openai --dry-run
# Full pipeline runs, results displayed, Lock not saved
# [Dry run — Lock not saved. Re-run without --dry-run to save.]
```

### Example 7 — View cached lock details after negotiation

```bash
synapse lock list
# chat_openai_v1.2.3_def67890

synapse lock show chat_openai_v1.2.3_def67890
# Full lock details: input schema, output schema, field mappings
```

## Related Commands

- [synapse lock](/docs/cli/lock) — View, manage, and migrate existing Schema Locks
- [synapse connect](/docs/cli/connect) — Connect to a Provider and execute an intent (implicit negotiation)
- [synapse evolve --tune](/docs/cli/evolve) — Batch re-negotiate all Schema Locks during SDK generation
- [synapse pack](/docs/cli/pack) — Manage installed Provider Packs
