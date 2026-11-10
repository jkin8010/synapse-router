---
sidebar_position: 3
title: SDK Guide
---

# SDK Guide

Synapse Router uses the `synapse sdk generate` command to convert Schema Negotiation results into zero-dependency, pure-function SDK code. The generated SDK does not depend on any `@synapse-router/*` packages and only uses the built-in `fetch`, making it runnable in any JavaScript/TypeScript environment.

## Generation Workflow

The command processes through four steps:

1. **Load Provider Pack** — Loads the specified Provider Pack (by pack id or path)
2. **Read Schema Lock** — Uses the Field Mappings in the Lock to build the canonical ↔ provider mapping
3. **Generate Code** — Generates TypeScript / Python SDK code based on those Field Mappings
4. **Output** — Writes to the `--output` directory, zero external dependencies

## Command Parameters

| Parameter | Type | Required | Default | Description |
|------|------|------|--------|------|
| `--pack <id>` | string | yes | — | Pack ID or path (e.g. `openai`, `./packs/openai`) |
| `--lang <lang>` | string | yes | — | Target language: `typescript` \| `python` |
| `--output <dir>` | string | yes | — | SDK output directory |
| `--provider <id>` | string | no | pack's provider | Override provider name in the generated SDK |
| `--base-url <url>` | string | no | pack default | Override the default base URL |
| `--with-billing` | flag | no | false | Include the BillingTracker class in the generated SDK |

## Usage Examples

### Example 1 — Basic Generation

```bash
synapse sdk generate --pack openai --lang typescript --output ./synapse-sdk
```

Running this creates a `./synapse-sdk/` directory containing TypeScript SDK code that can be directly imported into your project.

### Example 2 — With Billing Tracking

```bash
synapse sdk generate --pack openai --lang typescript --output ./synapse-sdk --with-billing
```

The generated SDK includes a `BillingTracker` class that automatically tracks usage for each API call. Suitable for production environments requiring billing and quota management.

### Example 3 — Reuse one Pack for another Provider

```bash
synapse sdk generate --pack openai --lang typescript \
  --provider deepseek \
  --base-url https://api.deepseek.com/v1 \
  --output ./synapse-sdk
```

Generates a DeepSeek SDK from the OpenAI-compatible pack. Useful when a provider exposes an OpenAI-compatible API.

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

- [synapse setup](/docs/cli/setup) — Scaffold an SDK project (`synapse setup --sdk`)
- [synapse lock](/docs/cli/lock) — Manage Schema Locks (list, migrate, detect expiration)
- [synapse pack](/docs/cli/pack) — Manage Provider Packs (install, update, search)
- [CLI command reference](/docs/cli) — Complete CLI command reference