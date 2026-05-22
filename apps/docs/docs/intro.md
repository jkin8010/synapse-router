---
sidebar_position: 1
title: Overview & Getting Started
---

# Synapse Router Overview & Getting Started

Synapse Router is a controlled Schema Negotiation and Multi-Provider Router layer designed for AI Agents. It sits between AI Agents and multiple Provider APIs, ensuring every request has a clear Contract before execution. The Router is not a runtime middleware — it is a development-time SDK Generation Engine.

## Getting Started

### 1. Installation

**Prerequisites:** Node.js 22+

Install the Synapse CLI globally:

```bash
npm install -g @synapse-router/cli
```

Or using pnpm:

```bash
pnpm add -g @synapse-router/cli
```

After installation, verify the version:

```bash
synapse --version
```

### 2. Provider Configuration

There are two ways to configure a Provider: interactive wizard or manual configuration.

**Interactive mode:** Run `synapse setup`, follow the prompts to select a Provider, enter your API Key, and complete the basic configuration.

```bash
synapse setup
```

**Manual mode:** Use the `synapse vault set` command to directly store an API Key and specify the API address.

```bash
synapse vault set deepseek sk-xxx --base-url https://api.deepseek.com/v1
synapse vault set openai sk-proj-xxx --base-url https://api.openai.com/v1
```

API Keys are encrypted using AES-256-GCM and are never written to disk in plain text. All log output is automatically redacted to ensure Keys never appear in Traces or Spans.

### 3. First Connect

After configuration, use the `synapse connect` command to connect to a Provider and execute a feature:

```bash
synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"Hello, please introduce yourself"}]}'
```

Expected output (example below; actual content varies by Provider):

```json
{
  "output": {
    "model": "deepseek-chat",
    "choices": [{"message": {"role": "assistant", "content": "..."}}],
    "usage": {"total_tokens": 50}
  }
}
```

If you have configured a billing strategy, add the `--billing` flag to automatically wrap usage tracking:

```bash
synapse connect deepseek chat --input '{"messages":[]}' --billing preCall
```

### 4. Generate SDK

After connection is verified, the next step is to use `synapse evolve` to generate a zero-dependency SDK. This command converts Schema Negotiation results into pure function SDK code — your application code no longer needs the Router, it only references the generated SDK.

```bash
synapse evolve
```

To include usage tracking capabilities:

```bash
synapse evolve --with-billing
```

For detailed evolve usage instructions, see the [SDK Guide](/docs/sdk).

## Core Position

The Router is not a runtime middleware — it is a **development-time SDK generation engine**. Your application code contains no Router, only the generated SDK. All negotiation, routing decisions, and Provider selection happen at development time; at runtime, there is only pure-code SDK.

**Negotiate at dev time, zero impact at runtime** — the negotiation phase can be complex, can call LLMs, and can explore because it is offline and one-time. At runtime, there is only pure-code SDK — deterministic, zero token cost, zero LLM surprises.

## Architecture Overview

The entire system workflow is divided into three stages:

1. **Schema Negotiation** — Intent matching + capability verification + field-level Manifest constraint checking. The negotiation engine matches the Agent's intent to a Provider's Feature and generates a Schema Contract.
2. **Provider Routing** — A multi-dimensional scoring routing engine scores, filters, and sorts candidate Providers based on strategy (cheap/fast/quality/balanced/cost-capped) to select the optimal Provider.
3. **SDK Generation** — Converts Schema Locks into pure function SDK code (TypeScript / Python) with zero external dependencies via `synapse evolve`.

The Synapse CLI provides a unified entry point for all of the above capabilities. See the [CLI Reference](/docs/cli) for detailed command documentation.

## Next Steps

- [/docs/cli](/docs/cli) — Complete command reference
- [/docs/sdk](/docs/sdk) — SDK generation and usage
- [/docs/api](/docs/api) — REST API documentation
- [/docs/packs](/docs/packs) — Provider Pack development guide
