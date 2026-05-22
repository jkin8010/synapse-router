---
sidebar_position: 3
title: SDK Guide
---

# SDK Guide

Synapse Router uses the `synapse evolve` command to convert Schema Negotiation results into zero-dependency, pure-function SDK code. The generated SDK does not depend on any `@synapse-router/*` packages and only uses the built-in `fetch`, making it runnable in any JavaScript/TypeScript environment.

## Evolve Workflow

The evolve command processes through four steps:

1. **Load Provider Pack** — Loads all Provider Packs from `packs/`, Registry, and local directories
2. **Negotiate Schema Lock** — Performs negotiation on each Provider's Feature, creating a frozen Schema Lock (similar to `package-lock.json`)
3. **Generate Code** — Generates TypeScript / Python SDK code based on the Field Mappings in the Lock
4. **Output** — Writes to the `--output` directory (default `./synapse-sdk`), zero external dependencies

## Command Parameters

| Parameter | Type | Required | Default | Description |
|------|------|------|--------|------|
| `--output <dir>` | string | no | `./synapse-sdk` | SDK output directory |
| `--tune` | flag | no | false | Re-negotiate all Schema Locks |
| `--with-billing` | flag | no | false | Include BillingTracker usage tracking class in the generated SDK |

## Usage Examples

### Example 1 — Basic Generation

```bash
synapse evolve
```

Running this creates a `./synapse-sdk/` directory in the current folder containing TypeScript SDK code that can be directly imported into your project.

### Example 2 — With Billing Tracking

```bash
synapse evolve --with-billing
```

The generated SDK includes a `BillingTracker` class that automatically tracks usage for each API call. Suitable for production environments requiring billing and quota management.

### Example 3 — Custom Output + Re-negotiate

```bash
synapse evolve --output ./my-sdk --tune
```

Outputs to a custom directory `./my-sdk` and forces re-negotiation of all Schema Locks. This is particularly useful after updating Provider Packs, ensuring the SDK reflects the latest Provider capabilities.

## Generated SDK Structure

```text
synapse-sdk/
├── index.ts          # Main entry point, exports all functions
├── types.ts          # TypeScript type definitions
├── providers/        # Per-provider function files
│   ├── deepseek.ts
│   └── openai.ts
└── billing.ts        # BillingTracker (only with --with-billing)
```

- **index.ts** — Main entry point, exports all SDK functions
- **types.ts** — TypeScript type definitions, including full type declarations for input and output parameters
- **providers/** — One file per Provider, encapsulating the corresponding API call logic
- **billing.ts** — Only generated when `--with-billing` is used, contains the BillingTracker class

## SDK Features

- **Zero Dependency** — Does not depend on `@synapse-router/*`, only uses built-in `fetch`
- **TypeScript & Python** — Supports output in both languages with complete type definitions
- **Deterministic** — Same input always produces the same output, eliminating runtime surprises
- **Billing Integration** — The `--with-billing` flag adds BillingTracker to automatically track each call
- **Schema Lock Management** — Lock works like `package-lock.json`; once frozen, it does not change automatically with Packs, providing a deterministic contract

## Related Commands

- [/docs/cli/lock](/docs/cli/lock) — Manage Schema Locks (list, migrate, detect expiration)
- [/docs/cli/pack](/docs/cli/pack) — Manage Provider Packs (install, update, search)
- [/docs/cli](/docs/cli) — Complete CLI command reference

- [/docs/cli/lock](/docs/cli/lock) — 管理 Schema Lock（列出、迁移、检测过期）
- [/docs/cli/pack](/docs/cli/pack) — 管理 Provider Pack（安装、更新、搜索）
- [/docs/cli](/docs/cli) — 完整 CLI 命令参考
