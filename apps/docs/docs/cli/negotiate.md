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
| `synapse negotiate --intent <x> --provider <y>` | Explicit | Manually trigger negotiation and view detailed lock information |
| `synapse connect <x> <y>` | Implicit (first call) | If no cached Schema Lock exists, negotiation runs automatically |
| `synapse connect <x> <y> --no-cache` | Implicit (forced) | Forces re-negotiation even if a valid cached lock exists |
| `synapse evolve --tune` | Batch | Re-negotiates all Schema Locks during batch SDK generation |

## Modes

The command supports two operation modes:

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

## Output

When a cached lock exists:
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

## Examples

### Example 1 — Negotiate without caching

```bash
synapse negotiate --intent chat --provider deepseek --no-cache
# Removed cached lock: chat_deepseek_v1.0.0_abc
# Created new lock: chat_deepseek_v1.0.0_def
```

### Example 2 — Scan all providers for matching intents

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

### Example 3 — View cached lock details after negotiation

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
