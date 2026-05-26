---
sidebar_position: 4.5
title: synapse sdk
---

# synapse sdk — Generate SDK from a Provider Pack

The `synapse sdk generate` command generates a zero-dependency SDK from a Provider Pack. It supports both TypeScript and Python output.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `--pack <id>` | string | Yes | Pack ID or path (e.g. `openai`, `./packs/openai`) |
| `--lang <lang>` | string | Yes | Target language: `typescript` or `python` |
| `--output <dir>` | string | Yes | Output directory for generated SDK |
| `--provider <id>` | string | No | Override provider name (e.g. `deepseek` using openai pack) |
| `--base-url <url>` | string | No | Override default base URL |

## Examples

### Example 1 — Generate TypeScript SDK

```bash
synapse sdk generate --pack openai --lang typescript --output ./generated-sdk
# Generates TypeScript SDK from the openai pack
```

### Example 2 — Generate Python SDK

```bash
synapse sdk generate --pack openai --lang python --output ./generated-sdk
# Generates Python SDK from the openai pack
```

### Example 3 — Generate with provider override

```bash
synapse sdk generate --pack openai --lang typescript --provider deepseek --base-url https://api.deepseek.com/v1 --output ./generated-sdk
# Generates DeepSeek SDK using openai pack structure
```

### Example 4 — Generate from a local pack path

```bash
synapse sdk generate --pack ./my-packs/custom-api --lang typescript --output ./sdk
# Generates SDK from a local pack directory
```

## Output Structure

```
<output-dir>/
├── index.ts           # Main entry point, exports client + types
├── client.ts          # HTTP client class (zero-dependency)
├── types.ts           # Type definitions
├── <feature>.ts       # Per-feature type files
├── README.md          # Usage documentation
├── package.json       # npm package manifest
└── tsconfig.json      # TypeScript configuration
```

For Python output (`--lang python`):

```
<output-dir>/
├── __init__.py        # Package init, exports client class
├── client.py          # HTTP client class (uses httpx)
├── pyproject.toml     # Python project manifest
└── README.md          # Usage documentation
```

## Related Commands

- [/docs/cli/pack](/docs/cli/pack) — View and install Provider Packs
- [/docs/sdk](/docs/sdk) — SDK usage detailed guide
