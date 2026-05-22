---
sidebar_position: 8
title: synapse config
---

# synapse config — Configuration Management

The config command manages Synapse Router's global configuration. It supports dot notation for accessing nested configuration items, such as `billing.strategy` and `route.strategies.xxx`. Configuration is persisted to `~/.synapse/config.json`.

## Namespace

| Namespace | Description |
|----------|------|
| `billing.*` | Billing configuration (strategy, limit, Provider, downgrade strategy) |
| `route.*` | Routing configuration (default strategy, custom strategy weights, preferences) |

## Subcommands

| Subcommand | Description |
|--------|------|
| `set <key> <value>` | Set a configuration value, supports dot notation |
| `get <key>` | Get a configuration value |
| `list` | List all configuration |

## Examples

Example 1 — Set billing strategy:
```bash
synapse config set billing.strategy perToken
```

Example 2 — Get a config value:
```bash
synapse config get billing.strategy
# perToken
```

Example 3 — List all configuration:
```bash
synapse config list
```

Example 4 — Set custom route strategy:
```bash
synapse config set route.strategies.my-custom '{"cost":3,"latency":2,"reliability":2,"featureMatch":2,"preference":1}'
```

## Related Commands

- [synapse billing config](/docs/cli/billing) — Shortcut for billing configuration
- [synapse setup](/docs/cli/setup) — Interactive setup wizard (automatically sets up base configuration)
