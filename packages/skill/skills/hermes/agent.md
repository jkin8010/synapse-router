# Synapse Router — Hermes Agent Configuration

## Project Identity

Synapse Router is a **development-time SDK generation engine** for multi-Provider API routing with explicit Schema contracts. It is NOT a runtime middleware. Application code never imports Synapse Router — it only uses the generated SDK.

**Core motto**: "开发时协商，运行时无感" (negotiate at dev time, zero-overhead at runtime).

**The project delivers**:
- CLI tool (`synapse`) for provider connection, setup, billing, vault, routing, and SDK generation
- HTTP API Server for RESTful Schema negotiation and provider execution
- MCP Server for Model Context Protocol integration
- SDK Generator producing zero-dependency TypeScript and Python SDKs
- Billing module with quota management and pricing strategy support

## What Hermes Should Know

1. **Codebase**: TypeScript 5.9+ monorepo using pnpm workspaces, with 13 packages under `packages/` and 6 apps under `apps/`. All packages independently compiled and publishable to npm as `@synapse-router/<name>`.

2. **Core Philosophy**: "开发时协商，运行时无感" — all Schema negotiation, routing strategy selection, and Provider choice happen at development time. The runtime environment has no Router, no LLM, and no random decisions — only deterministic generated code.

3. **Runtime Characteristics**: Generated SDKs have zero external dependencies. They use only native `fetch` for HTTP calls. The runtime path has zero token cost and zero LLM dependencies.

4. **Communication Rules**: Communicate with users in Chinese (Simplified). All code comments, docstrings, log messages, and identifiers must be in English.

5. **Dual Schema Design**: The project uses a dual-schema pattern — `AgentSchema` (what the agent needs) and `ServerSchema` (what the provider commits to). Negotiation matches these schemas and produces `SchemaLock` objects.

6. **Provider Packs**: Each Provider is described by a `provider-card.json` (identity, service config, features) and DSL files for each feature. Built-in packs include OpenAI, DeepSeek, Replicate, Stability AI, and ComfyUI.

7. **File-based State**: All persistent state is file-based (Vault keys, Schema Locks, config, quotas). No database required.

## CLI Tools

All CLI commands are accessed via the `synapse` binary. Every command supports `--help` for detailed usage.

| Command | Description |
|---------|-------------|
| `synapse connect <provider> <intent>` | Connect to a provider and execute a feature |
| `synapse setup` | Interactive first-time setup wizard |
| `synapse config set\|get\|list [key] [value]` | Manage configuration (supports `billing.*` dot notation) |
| `synapse billing init [--strategy <s>]` | Initialize billing configuration |
| `synapse billing config` | View or modify billing configuration |
| `synapse billing status [--format json\|table]` | View quota status and cost estimates |
| `synapse route <intent> [--strategy <s>]` | Multi-dimensional provider routing |
| `synapse evolve [--output <dir>] [--with-billing]` | Generate zero-dependency SDK from all packs |
| `synapse vault set <provider> <key>` | Store encrypted API key |
| `synapse vault list` | List stored providers |
| `synapse vault get <provider>` | Retrieve stored API key |
| `synapse vault remove <provider>` | Remove stored API key |
| `synapse lock list` | List all Schema Locks |
| `synapse lock outdated` | Detect outdated Schema Locks |
| `synapse lock migrate <id> <version>` | Migrate a Schema Lock to new Pack version |
| `synapse pack search <query>` | Search for packs on Registry |
| `synapse pack add <pack-id>` | Install a Pack from Registry |
| `synapse pack list` | List installed Packs |
| `synapse provider list [--remote]` | List available providers |
| `synapse provider show <id>` | Show provider card details |
| `synapse negotiate <schema-file>` | Run schema negotiation |
| `synapse sdk generate --pack <id>` | Generate SDK from a specific Pack |
| `synapse generate <source>` | Generate a Provider Pack from OpenAPI spec |
| `synapse smoke --provider <name>` | Run provider smoke tests |

## Architecture Principles

1. **Contract before call** — Every route starts with a Schema contract; no execution without explicit contract
2. **Explicit negotiation** — Schema changes must be visible; degradation/adaptation/rejection provides structured reasons, no silent fallback
3. **Providers replaceable, not equivalent** — Adapters honestly expose capabilities; Router selects by contract match/cost/latency
4. **Standardized output** — Application code consumes Router-defined result types; Provider-specific response structure stays in Adapter
5. **Core minimal, boundaries extensible** — Core defines only contracts, negotiation results, routing decisions, and error forms
6. **Observable routing** — Every routing decision is explainable: request Schema, selected Provider, negotiation result, and reason codes are traceable
7. **Dev-time negotiation, runtime invisible** — Complex logic (Schema negotiation, Provider selection, degradation) completes at dev time
8. **No runtime LLM** — Zero token cost on the runtime path, no LLM dependency
9. **Runtime = pure code SDK** — Runtime has no Router, no LLM, no random decisions, only deterministic SDK code
10. **Production logs flow back to dev** — `.synapse/` logs sync via Git from production to development for feedback-driven optimization
11. **Watchdog deployed independently** — `synapse watchdog` is a separate process, not embedded in the SDK

## Design Constraints

- **Connector is thin** — Only handles HTTP request construction, field mapping (canonical to provider), and base_url override. No business logic in the connector layer.
- **Schema Lock is immutable** — Once created, a lock does not auto-update when the source Pack changes. This provides deterministic, repeatable behavior across SDK generations.
- **SDK zero-dependency** — Generated SDKs must not import from any `@synapse-router/*` package. They should be directly publishable to npm with only native Node.js dependencies.
- **Vault never writes plaintext** — API keys are encrypted with AES-256-GCM before writing to disk. Decryption happens only in memory. Keys are never logged, traced, or dumped.
- **Registry is optional** — The Router works fully offline using local Packs. The Registry is an enhancement for Pack discovery and sharing.
- **API Key redaction** — All trace and span outputs automatically redact API key values. No key ever appears in logs, even in error messages.

## Coding Conventions

- **TypeScript strict mode**: All packages use `tsconfig.json` with `strict: true`. No exceptions.
- **Package naming**: `@synapse-router/<name>` pattern. Each package is independently compiled and published.
- **Test files**: Co-located with source, named `*.test.ts`. Use Node.js native test runner (`tsx --test`).
- **Public API**: Exported through `src/index.ts` barrel exports. No deep imports from package internals.
- **Error handling**: Use structured error types. Never swallow exceptions. Never use `catch {}` without handling.
- **Logging**: Use the `@synapse-router/observability` Tracer injection points. Never use `console.log` for application logic.
- **Commit messages**: Use Chinese, format: `<type>: <description>` (e.g., `feat(11-04): create agent configuration files`).
- **Code comments**: English only. All docstrings and inline documentation in English.
- **No runtime Router**: Never import Router packages into generated SDK code.

## Agent Definitions

This project defines 8 specialized sub-agents (see `AGENTS.md`):

| Agent | Focus Area |
|-------|-----------|
| **Synapse Core Developer** | Core types, negotiator, router — foundational packages |
| **Provider Pack Developer** | Provider Packs, pack-generator, DSL files, providers |
| **Connector Developer** | Connector, lock, vault — connection layer and storage |
| **CLI Developer** | apps/cli — CLI commands, interactive modes, argument parsing |
| **API Developer** | apps/api — HTTP API Server, routes, middleware |
| **SDK Generator Developer** | sdk-generator — multi-language SDK generation pipeline |
| **Test Engineer** | All package tests, E2E tests — quality assurance |
| **Documentation Writer** | knowledge/, docs/, README — project documentation |

To use a sub-agent, reference the agent name in a prompt to the `Agent` tool with `subagent_type=general-purpose`.

## Common Tasks

### Setting up a new Provider
```bash
synapse setup                              # Interactive wizard
synapse vault set deepseek sk-xxx           # Store API key
synapse connect deepseek chat --input '{}'  # Test connection
```

### Generating an SDK
```bash
synapse evolve                              # Generate TypeScript SDK for all providers
synapse evolve --output ./my-sdk            # Specify output directory
synapse evolve --with-billing               # Include BillingTracker in SDK
```

### Managing Billing
```bash
synapse billing init --strategy per-token --limit 10 --provider deepseek
synapse billing status --format table
synapse config set billing.strategy perToken
```

### Investigating Issues
```bash
synapse lock outdated                       # Check for stale Schema Locks
synapse billing status --format json        # Check quota status
synapse vault list                          # Check stored API keys
synapse provider list                       # Verify loaded providers
```

### Creating a Feature
```bash
# 1. Understand intent matching
synapse negotiate --intent chat --provider openai

# 2. Generate SDK with new config
synapse evolve --tune

# 3. Test the result
synapse connect openai chat --input '{"messages":[{"role":"user","content":"test"}]}'
```
