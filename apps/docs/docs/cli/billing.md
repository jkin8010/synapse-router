---
sidebar_position: 5
title: synapse billing
---

# synapse billing — Billing Management and Quota Viewing

The billing command manages usage billing and quotas for Provider calls. It supports multiple pricing strategies: `flat` (fixed rate per call), `perToken` (per-token billing), `perUnit` (per-unit billing), and `tiered` (tiered pricing). Quota persistence uses FileQuotaStorage, stored at `~/.synapse/quotas/`.

## Subcommands

| Subcommand | Description |
|--------|------|
| `init [--strategy <s>] [--limit <n>] [--provider <id>]` | Interactive billing configuration initialization |
| `config [set\|get]` | View or modify billing configuration |
| `status [--format json\|table]` | View quota status and estimated costs |

## Examples

Example 1 — Interactive initialization:
```bash
synapse billing init
```

Example 2 — Non-interactive init with parameters:
```bash
synapse billing init --strategy perToken --limit 10 --provider deepseek
```

Example 3 — Check status (table format):
```bash
synapse billing status
```

Example 4 — Check status (JSON format):
```bash
synapse billing status --format json
```

## Downgrade Strategies

| Strategy | Behavior |
|------|------|
| `warn` (default) | Logs a warning but does not block calls |
| `reject` | Rejects calls when quota is exceeded |
| `downgrade` | Automatically downgrades to a lower-cost Provider |
| `notify` | Sends a notification and continues execution |

## Related Commands

- [synapse connect](/docs/cli/connect) — Billing is automatically wrapped around connect calls
- [synapse config](/docs/cli/config) — Manage billing configuration via `synapse config set billing.*`
- [SDK Guide](/docs/sdk) — Generate an SDK with BillingTracker included (`--with-billing`)
