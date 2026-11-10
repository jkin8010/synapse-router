---
sidebar_position: 5
title: User Journey Guide
---

# User Journey Guide

This guide walks through the complete developer workflow with Synapse Router — from installation to production SDK integration.

## Stage 1: Installation and Setup

The first step is installing the Synapse CLI and configuring your first provider.

### Install the CLI

```bash
npm install -g @synapse-router/cli
```

Verify the installation:

```bash
synapse --version
```

### First-Time Setup

Run the interactive setup wizard to configure your first provider:

```bash
synapse setup
```

The wizard guides you through:
1. Choosing a provider (DeepSeek, OpenAI, Moonshot, etc.)
2. Entering your API key (hidden input)
3. Configuring the base URL (with a sensible default)
4. Selecting a pack for schema compatibility

### Alternative: Manual Configuration

If you prefer to configure manually, store your API key directly:

```bash
synapse vault set deepseek sk-xxx --base-url https://api.deepseek.com/v1
```

Verify the key was stored:

```bash
synapse vault list
```

> **Next:** [Stage 2: Schema Negotiation](#stage-2-schema-negotiation)

---

## Stage 2: Schema Negotiation

Once a provider is configured, the next step is Schema Negotiation — matching your agent's intent to a provider's capabilities and creating a Schema Lock.

### Interactive Negotiation

Run `synapse negotiate` with no arguments for the full interactive flow:

```bash
synapse negotiate
```

This launches an 8-step wizard:
1. **Select Intent** — choose from all available intents (chat, text-to-image, etc.)
2. **Select Provider** — pick from providers supporting your chosen intent
3. **View Schema** — see required and optional fields with color coding
4. **Select Fields** — include or exclude optional fields
5. **LLM Key Check** — configure an LLM API key for AI-assisted negotiation, or proceed with a deterministic stub
6. **Lock Diff Preview** — compare against any existing lock before saving
7. **Confirm Save** — persist the Schema Lock to `~/.synapse/schemas/`
8. **Post-Negotiation Menu** — choose next action (test connection, generate SDK, etc.)

### Non-Interactive Negotiation

For scripting and CI environments:

```bash
synapse negotiate --intent chat --provider deepseek
```

Learn more about all options in the [negotiate command documentation](/docs/cli/negotiate).

> **Next:** [Stage 3: Test Connection](#stage-3-test-connection)

---

## Stage 3: Test Connection

After negotiation, test that the connection works before generating SDKs.

### Basic Connection Test

```bash
synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"Hello"}]}'
```

If no cached Schema Lock exists, negotiation runs automatically (implicit negotiation).

### Smoke Test

Use the `--smoke` flag to run provider smoke tests against live APIs:

```bash
synapse connect --smoke --provider openai
```

### Billing-Aware Connection

If billing is configured, automatically wrap the call with cost tracking:

```bash
synapse connect deepseek chat --input '{"messages":[]}' --billing preCall
```

Learn more in the [connect command documentation](/docs/cli/connect).

> **Next:** [Stage 4: SDK Generation](#stage-4-sdk-generation)

---

## Stage 4: SDK Generation

Once negotiation and connection are verified, generate a zero-dependency SDK.

### Generate an SDK

```bash
synapse sdk generate --pack openai --lang typescript --output ./synapse-sdk
```

This reads the specified provider pack and generates TypeScript SDK code into the output directory.

### Options

```bash
# Include billing tracking
synapse sdk generate --pack openai --lang typescript --output ./synapse-sdk --with-billing

# Generate Python instead of TypeScript
synapse sdk generate --pack openai --lang python --output ./synapse-sdk

# Reuse one compatible pack for another provider
synapse sdk generate --pack openai --lang typescript --provider deepseek \
  --base-url https://api.deepseek.com/v1 --output ./synapse-sdk
```

Run one `sdk generate` per pack; loop over packs to cover all providers.

### SDK Output Structure

```
synapse-sdk/
├── deepseek/
│   ├── index.ts           # Exports client + types
│   ├── client.ts          # HTTP client (zero-dependency)
│   ├── types.ts           # Type definitions
│   └── README.md
├── openai/
│   └── ...
├── genesis.json           # Profile-informed metadata (with --with-profile)
├── synapse.json           # Generation metadata
└── tsconfig.json
```

The generated SDK is **zero-dependency** — it uses only built-in `fetch` and has no runtime Router or LLM dependency. All negotiation, routing, and provider selection decisions were made at development time.

> **Next:** [Stage 5: Production Integration](#stage-5-production-integration)

---

## Stage 5: Production Integration

Integrate the generated SDK into your application.

### Import and Use

```typescript
import { DeepSeekSDK } from "./synapse-sdk/deepseek";

const client = new DeepSeekSDK();
const output = await client.chat({
  messages: [{ role: "user", content: "Hello" }],
});

console.log(output);
```

### Log Collection

When running in production, the SDK automatically records events to `.synapse/watchdog/events.ndjson`. These events capture:
- Request/response metadata
- Latency and success rates
- Error patterns

### Data Synchronization

Export production data for development analysis:

```bash
# On production
synapse config export --stdout | ssh dev "synapse config import --stdin --merge"
```

Monitor production events:

```bash
synapse watchdog
```

Learn more about the production workflow in the [SDK Guide](/docs/sdk).

> **Next:** [Stage 6: Continuous Improvement](#stage-6-continuous-improvement)

---

## Stage 6: Continuous Improvement

The Synapse Router workflow is designed for continuous feedback loops. Production data flows back to the development environment to improve SDK quality.

### Profile Data Loop

1. **Production** generates events -> `.synapse/watchdog/events.ndjson`
2. **Refresh profiles** -> `synapse config profile refresh` aggregates events
3. **Export** -> `synapse config export` packages `.synapse/` as tar.gz
4. **Import** -> `synapse config import` restores data in dev environment
5. **Regenerate** -> `synapse sdk generate --pack <id> --lang <lang> --output <dir>` regenerates the SDK with updated packs

### Lock Health

Check for outdated Schema Locks:

```bash
synapse lock outdated
```

When provider packs are updated, migrate existing locks:

```bash
synapse lock migrate chat_openai_v1.0.0_abc12345
```

### Pack Updates

Check for newer pack versions in the Registry:

```bash
synapse pack check
synapse pack update openai
```

### Iteration Cycle

The recommended iteration cycle for teams using Synapse Router:

```
Week 1:  Install -> Setup -> Negotiate -> Connect -> Evolve -> Deploy
Week 2:  Collect production logs -> Export -> Import -> Evolve --with-profile -> Deploy v2
Week 4:  Review lock health -> Update packs -> Re-negotiate -> Evolve v3
Monthly: Profile-driven tuning -> Strategy adjustment -> Full pipeline
```

## Complete Workflow Summary

```
install -> setup -> negotiate -> connect -> sdk generate -> deploy
                                                  |
                      continuous <- profile <- collect logs
                        |
                   re-negotiate -> regenerate -> re-deploy
```

Related documentation:
- [CLI Command Reference](/docs/cli)
- [synapse negotiate](/docs/cli/negotiate)
- [synapse connect](/docs/cli/connect)
- [SDK Guide](/docs/sdk)
- [synapse lock](/docs/cli/lock)
- [synapse pack](/docs/cli/pack)
- [synapse config](/docs/cli/config)
