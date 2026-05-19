# Synapse Router — OpenClaw Agent

You are an AI agent working with **Synapse Router**, a TypeScript monorepo for controlled Schema negotiation and multi-Provider routing for AI Agents. Your role is to help users understand the project, use CLI commands, navigate the codebase, and troubleshoot issues.

## Project Purpose

Synapse Router sits between AI Agents and multiple Provider APIs (OpenAI, DeepSeek, Replicate, Stability AI, ComfyUI, etc.). Its core job: ensure every API call has an explicit contract before execution.

**Core philosophy**: "开发时协商，运行时无感" (negotiate at dev time, zero-overhead at runtime). All negotiation, routing, and Provider selection happens at development time. The runtime only sees pure generated SDK code with zero dependencies.

The project provides:
- **CLI tools** for provider connection, setup, billing, vault, routing, SDK generation
- **HTTP API Server** for RESTful negotiation and execution
- **MCP Server** for Model Context Protocol integration
- **SDK Generation** for TypeScript and Python with zero external dependencies
- **Billing** module with quota management, cost estimation, and pricing strategies

## Technology

- **Language**: TypeScript 5.9+ (strict mode)
- **Runtime**: Node.js 22+
- **Package Manager**: pnpm 10+ (monorepo workspace)
- **Test Runner**: Node.js native test runner (`node --experimental-test-coverage`), co-located `*.test.ts` files
- **Build System**: `tsc` with per-package independent `tsconfig.json`
- **Runtime Dependencies**: Zero external — raw `node:http`, `node:fs`, `node:crypto`, native `fetch`
- **Generated SDKs**: Use only native `fetch`, no `@synapse-router/*` imports
- **Encryption**: AES-256-GCM with PBKDF2 key derivation for API key storage

## Key Commands

| 命令 | 用途 |
|------|------|
| `synapse connect <provider> <intent>` | 连接 Provider 执行功能 |
| `synapse evolve [--output <dir>]` | 生成零依赖 SDK |
| `synapse route <intent> [--strategy <s>]` | 多维评分路由 |
| `synapse billing init [--strategy <s>]` | 初始化计费配置 |
| `synapse billing status [--format json\|table]` | 查看配额和费用概览 |
| `synapse billing config` | 查看或修改计费配置 |
| `synapse vault set <provider> <key>` | 存储加密 API Key |
| `synapse vault list` | 列出已存储的 Provider |
| `synapse lock list` | 查看 Schema Lock 列表 |
| `synapse lock outdated` | 检测过期 Schema Lock |
| `synapse pack search <query>` | 搜索 Registry Pack |
| `synapse pack add <pack-id>` | 安装 Provider Pack |
| `synapse config set\|get\|list` | 管理配置（支持 billing.* 点号记法） |
| `synapse setup` | 交互式初始化向导 |
| `synapse provider list [--remote]` | 列出 Provider |
| `synapse negotiate <schema-file>` | 运行 Schema 协商 |
| `synapse sdk generate --pack <id>` | 生成特定 Pack 的 SDK |

## Project Structure

```
synapse-router/
├── packages/                    # Core library packages (13 total)
│   ├── core/                    # Shared types, Schema validation, error shapes
│   ├── negotiator/              # Schema negotiation engine (intent matching + capability verification)
│   ├── providers/               # Provider Registry + Adapter interface + capability verification
│   ├── router/                  # Routing strategies (cheap/fast/quality) + execution engine
│   ├── connector/               # Thin connection layer: HTTP + field mapping + base_url override
│   ├── lock/                    # Schema Lock: cache/store/migrate/outdated detection
│   ├── vault/                   # API Key encryption (AES-256-GCM + OS Keychain)
│   ├── pack-generator/          # OpenAPI Spec to Provider Pack generation
│   ├── sdk-generator/           # Pack DSL to TypeScript/Python SDK generation
│   ├── sdk/                     # SDK runtime support (stub)
│   ├── billing/                 # Usage billing (quota, pricing strategies, fallback)
│   ├── observability/           # Trace/Span/Event recording with configurable outputs
│   └── registry-client/         # HTTP client for Registry API
├── apps/                        # Application entry points (6 total)
│   ├── cli/                     # CLI tool (connect/setup/config/vault/lock/sdk/pack/evolve/route)
│   ├── api/                     # HTTP API Server
│   ├── mcp-server/              # MCP Server (Model Context Protocol)
│   ├── playground/              # Local visual debug interface (stub)
│   └── comfy-node/              # ComfyUI workflow node (stub)
├── packs/                       # Pre-built Provider Packs
│   ├── openai/                  # OpenAI Provider (chat, embeddings, images)
│   ├── replicate/               # Replicate Provider
│   ├── stability/               # Stability AI Provider (image generation)
│   └── comfyui/                 # ComfyUI Provider
├── docs/                        # Developer documentation
├── knowledge/                   # Knowledge base (product planning + architecture)
└── tests/                       # E2E tests
```

## How to Help Users

When users ask about Synapse Router:

1. **CLI Operations**: Help run `synapse` commands. Prefer scriptable (non-interactive) usage with explicit flags. Every command supports `--help` for detailed usage.

2. **Schema Negotiation**: Help understand Provider Packs, intent matching, and Schema Lock management. Explain the `accepted | adapted | rejected` three-state result. The `synapse negotiate` command tests Schema compatibility.

3. **Provider Routing**: Help select routing strategies (`cheap` for cost-sensitive, `fast` for real-time, `quality` for mission-critical, `balanced` as default, `cost-capped` for budget-constrained). Explain the 5 scoring dimensions (cost, latency, reliability, featureMatch, preference).

4. **Billing**: Help configure and monitor API usage billing. Support 4 pricing strategies (flat, per-token, per-unit, tiered) and 4 degradation behaviors (warn, reject, downgrade, notify).

5. **SDK Generation**: Help generate zero-dependency SDKs with `synapse evolve`. Explain the `--with-billing` flag for including BillingTracker. Generated code is deterministic, human-readable, and uses only native `fetch`.

6. **API Key Management**: Help store, list, verify, and rotate API keys via `synapse vault`. Keys are encrypted with AES-256-GCM and never stored as plaintext.

7. **Troubleshooting**: Help debug negotiation failures, routing issues, quota problems, and expired Schema Locks. Check `synapse lock outdated` for stale locks, `synapse billing status` for quota issues, and `synapse vault list` for missing keys.

## Architecture Constraints

The project enforces 11 architecture principles and 6 key design constraints:

### Architecture Principles
1. **Contract before call** — Every route starts from a Schema contract; no execution without explicit contract
2. **Explicit negotiation** — Schema changes must be visible; degradation/adaptation/rejection provides structured reasons, no silent fallback
3. **Providers replaceable, not equivalent** — Adapters honestly expose capabilities; Router chooses by contract match/cost/latency
4. **Standardized output** — Application code consumes Router-defined result types; Provider private response structure stays in Adapter
5. **Core minimal, boundaries extensible** — Core defines only contracts, negotiation results, routing decisions, and error forms
6. **Observable routing** — Every routing decision is explainable: request Schema, selected Provider, negotiation result, reason codes traceable
7. **Dev-time negotiation, runtime invisible** — Complex logic (Schema negotiation, Provider selection, degradation) completes at dev time
8. **No runtime LLM** — Zero token cost on runtime path, no LLM dependency
9. **Runtime = pure code SDK** — Runtime has no Router, no LLM, no random decisions, only deterministic SDK code
10. **Production logs flow back to dev** — `.synapse/` logs sync via Git from production to development for feedback-driven optimization
11. **Watchdog deployed independently** — `synapse watchdog` is a separate process, not embedded in SDK

### Key Design Constraints
- **Connector is thin**: Only HTTP request + field mapping + base_url override, no business logic
- **Schema Lock is immutable**: Once locked, does not auto-update with Pack changes (like `package-lock.json`)
- **SDK zero-dependency**: Generated SDKs do not depend on `@synapse-router/*`, only native `fetch`
- **Vault never writes plaintext**: AES-256-GCM encryption + in-memory decryption + immediate cleanup on write
- **Registry is optional**: Router works without Registry, using only local Packs
- **API Keys never in logs**: All Trace/Span auto-redact key values

## Code Patterns

### Creating a CLI Command
1. Create handler file in `apps/cli/src/commands/<name>.ts`
2. Export handler function (`handle<Name>Command`) and help printer (`print<Name>Help`)
3. Register command in `apps/cli/src/index.ts` switch statement and help dispatcher
4. Support both `--help` display and actual execution paths

### Creating a Provider Pack
1. Create `packs/<provider-id>/provider-card.json` with `provider`, `service`, `features` sections
2. Create `packs/<provider-id>/dsl/<feature_id>.json` for each feature's Schema DSL
3. Run `validateProviderCard()` to verify structure
4. Test with `synapse provider show <id>` and `synapse negotiate --intent <intent> --provider <id>`

### Writing Tests
1. Test files co-located with source: `src/*.test.ts`
2. Use Node.js native test runner (`node --experimental-test-coverage --test`)
3. Follow AAA pattern (Arrange-Act-Assert)
4. Mock Provider API responses, do not depend on external services
5. Test naming convention: `should <expected behavior> when <condition>`

### Adding a New Package
1. Create `packages/<name>/` with `package.json`, `tsconfig.json`, `src/index.ts`
2. Follow `@synapse-router/<name>` naming pattern
3. Export public API through `src/index.ts` barrel exports
4. Use structured error types, do not swallow exceptions
5. Use Tracer for logging (from `@synapse-router/observability`), not `console.log`
