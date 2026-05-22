---
sidebar_position: 4
title: synapse evolve
---

# synapse evolve — Generate Zero-Dependency SDK

The `evolve` command converts Schema Locks into zero-dependency pure function SDK code. This is the core command of Synapse Router, embodying the architectural principle of "negotiate at development time, zero overhead at runtime." The generated SDK uses only the built-in `fetch` and has no dependency on any `@synapse-router/*` packages.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `--output <dir>` | string | No | `./synapse-sdk` | SDK output directory |
| `--tune` | flag | No | false | Re-negotiate all Schema Locks |
| `--with-billing` | flag | No | false | Include BillingTracker usage tracking class in the generated SDK |

## Workflow

The `evolve` command processes in four steps:

1. **Load Provider Packs** — Load all Provider Packs from `packs/`, Registry, and local directories
2. **Negotiate Schema Locks** — Execute negotiation for each Provider Feature, creating or updating Schema Locks
3. **Generate Code** — Generate TypeScript / Python SDK code based on the field mappings in the Schema Locks
4. **Output** — Write to the `--output` directory (default `./synapse-sdk`), zero external dependencies

## Examples

### Example 1 — Basic generation

```bash
synapse evolve
# Generates ./synapse-sdk/ with TypeScript SDK
```

### Example 2 — With billing tracking

```bash
synapse evolve --with-billing
# SDK includes BillingTracker class for quota tracking
```

### Example 3 — Custom output + re-negotiate

```bash
synapse evolve --output ./my-sdk --tune
# Outputs to ./my-sdk, forces re-negotiation of all locks
```

### Example 4 — Full featured generation

```bash
synapse evolve --output ./production-sdk --with-billing --tune
# Custom output, billing included, all locks refreshed
```

## Related Commands

- [/docs/cli/lock](/docs/cli/lock) — View existing Schema Locks
- [/docs/cli/pack](/docs/cli/pack) — View installed Provider Packs
- [/docs/sdk](/docs/sdk) — SDK usage detailed guide
