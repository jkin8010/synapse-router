---
sidebar_position: 7
title: synapse lock
---

# synapse lock — Manage Schema Locks

The lock command manages frozen snapshots of Schema Contracts, known as Schema Locks. A Schema Lock is similar to `package-lock.json`: once locked, it is immutable and does not automatically change with Pack updates, ensuring deterministic behavior. It supports outdated detection and migration.

## Schema Lock Properties

- **Immutable** — Once locked, does not automatically change with Pack updates, ensuring deterministic behavior
- **Outdated Detection** — `synapse lock outdated` detects Locks that need renegotiation after Pack version changes
- **Migration** — `synapse lock migrate` migrates an existing Lock to a new Pack version

## Subcommands

| Subcommand | Description |
|--------|------|
| `list` | List all Schema Locks |
| `show <lock-id>` | Show Lock details (Provider, Feature, version, field mapping) |
| `remove <lock-id>` | Remove the specified Lock |
| `migrate <lock-id> <new-pack-version>` | Migrate a Lock to a new Pack version |
| `outdated` | Detect outdated Locks (need renegotiation after Pack version changes) |

## Examples

Example 1 — List all locks:
```bash
synapse lock list
```

Example 2 — Show lock details:
```bash
synapse lock show chat_deepseek_v1.0.0
```

Example 3 — Check for outdated locks:
```bash
synapse lock outdated
```

Example 4 — Migrate a lock:
```bash
synapse lock migrate chat_deepseek_v1.0.0 deepseek-v3
```

## Related Commands

- [synapse negotiate](/docs/cli/negotiate) — Explicitly trigger Schema negotiation and create Schema Locks
- [synapse evolve --tune](/docs/cli/evolve) — Renegotiate and update all Locks
- [synapse pack](/docs/cli/pack) — Manage Provider Packs
