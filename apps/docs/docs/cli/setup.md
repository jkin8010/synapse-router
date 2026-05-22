---
sidebar_position: 9
title: synapse setup
---

# synapse setup — Interactive Setup Wizard

The setup command launches an interactive setup wizard that guides first-time users through Provider selection, API Key configuration, and basic parameter setup. It is designed for new users to get started quickly without needing to memorize command arguments.

## Usage

```bash
synapse setup
```

## Wizard Flow

The interactive wizard guides through:

1. **Select Provider** — Choose a target Provider from the installed Packs list (e.g., `deepseek`, `openai`)
2. **Configure API Key** — Enter an API Key, automatically encrypted and stored in the Vault (AES-256-GCM)
3. **Set Basic Parameters** — Configure default model, base URL, billing strategy, etc.
4. **Confirm Configuration** — Review and confirm the configuration summary

## Examples

Example 1 — Start setup wizard:

```bash
synapse setup
# Interactive prompts:
# ? Select a provider: deepseek
# ? Enter API Key: [hidden input]
# ? Default model: deepseek-chat
# ? Billing strategy: perToken
# ✓ Configuration saved
```

Example 2 — After setup, verify with connect:

```bash
synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"Hello"}]}'
```

## Related Commands

- [synapse vault set](/docs/cli/vault) — Manually configure API Keys
- [synapse config](/docs/cli/config) — Manually manage configuration
