---
sidebar_position: 6
title: synapse pack
---

# synapse pack — Manage Provider Packs

The pack command manages the installation, search, update, and removal of Provider Packs. Each Provider Pack is a directory containing a `provider-card.json` (Provider capability declaration) and `dsl/` (Agent Schema DSL files). Packs can be installed from a local or remote Registry.

## Subcommands

| Subcommand | Description |
|--------|------|
| `add <pack-id>` | Install a Pack from the Registry |
| `search <query>` | Search for Packs in the Registry |
| `list [--remote]` | List local or remote Packs |
| `update <pack-id>` | Update an installed Pack |
| `remove <pack-id>` | Remove an installed Pack |
| `show <pack-id>` | Show Pack details |

## Examples

Example 1 — Search for a provider pack:
```bash
synapse pack search deepseek
```

Example 2 — Install a pack:
```bash
synapse pack add deepseek-v3
```

Example 3 — List local packs:
```bash
synapse pack list
```

Example 4 — Show pack details:
```bash
synapse pack show deepseek-v3
```

Example 5 — Update an installed pack:
```bash
synapse pack update deepseek-v3
```

Example 6 — Remove a pack:
```bash
synapse pack remove deepseek-v3
```

## Related Commands

- [synapse lock](/docs/cli/lock) — Manage Schema Locks associated with Packs
- [Pack Development Guide](/docs/packs) — Guide for developing Provider Packs
