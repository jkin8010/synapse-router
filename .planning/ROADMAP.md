# Roadmap: Synapse Router

## Milestones

- **v1.0 Negotiator Reliability** — Phase 1 (shipped 2026-05-07)
- **v1.1 Testing & Playground** — Phases 2-4 (in progress)
- **v1.2 Router Integration** — Phase 5 (planned)
- **v2.0 Offline Evolution** — Phases 6-7 (planned)
- **v2.1 Billing Integration** — Phases 8-10 (planned)

## Phases

- [x] **Phase 1: Negotiator Reliability** — Full contract verification loop shipped
- [x] **Phase 2: E2E End-to-End Testing** — Core workflows covered by automated E2E tests
- [x] **Phase 3: Playground Web UI** — Visual debugging interface for negotiate requests
- [x] **Phase 4: Provider Smoke Tests** — Real provider API integrations verified
- [x] **Phase 5: Router as SDK Generator** — Router evolves from CLI tool to SDK generation engine
- [x] **Phase 6: Local Evolution Engine** — .synapse/ log system, watchdog, export/import, evolve flow
- [x] **Phase 7: Registry-Router Collaboration** — Registry change-detector triggers evolve flow
- [ ] **Phase 8: Connector Wrapper + FileQuotaStorage** — Billing wrapper and file-based quota storage
- [x] **Phase 9: SDK Pricing Emission** — SDK Generator emits BillingTracker with --with-billing flag
- [ ] **Phase 10: CLI Billing Commands** — billing init/config/status commands and connect auto-wrap

## Phase Details

<details>
<summary>v1.0 Negotiator Reliability (Phase 1) — SHIPPED 2026-05-07</summary>

### Phase 1: Negotiator Reliability
**Goal**: Full contract verification loop: Schema negotiation -> Manifest matching -> SDK code generation -> Mock test -> Registry async submission
**Plans**: 7 plans (4 core + 3 gap closure)

Plans:
- [x] 01-01: Contract Mocker package -- zero-dependency HTTP Mock Server
- [x] 01-02: Manifest types and matching -- constraint definitions + three diff detection types
- [x] 01-03: Pipeline + retry logic -- negotiateAndVerify full-chain orchestration
- [x] 01-04: Registry integration -- Fire-and-forget async verification submission

</details>

### v1.1 Testing & Playground (In Progress)

**Milestone Goal:** Establish complete E2E test coverage and a visual debugging interface, ensuring the full pipeline is verifiable and observable.

#### Phase 2: E2E End-to-End Testing
**Goal**: Core workflows are covered by automated E2E tests that validate the full negotiate-and-verify pipeline from multiple entry points
**Depends on**: Phase 1
**Requirements**: E2E-01, E2E-02, E2E-03, E2E-04, E2E-05, E2E-06
**Success Criteria** (what must be TRUE):
  1. E2E test framework (test runner, fixture management, assertion utilities) is operational and `pnpm test:e2e` invokes all E2E tests with structured output
  2. Three application entry point tests pass: CLI `synapse connect --task "..."` full flow, API `/negotiate` HTTP request/response, MCP Server negotiate tool
  3. Full-chain `negotiateAndVerify` pipeline test passes end-to-end (negotiate -> manifest match -> SDK code generation -> mock test with contract-mocker)
  4. SDK generated code during E2E tests compiles and executes successfully when imported, verifying no broken output
**Plans**: 7 plans (4 core + 3 gap closure)

Plans:
- [x] 02-01-PLAN.md -- E2E test framework infrastructure (helpers: helpers.ts, fixtures.ts)
- [x] 02-02-PLAN.md -- CLI connect and API /negotiate entry point E2E tests (cli-connect.test.ts, api-negotiate.test.ts)
- [x] 02-03-PLAN.md -- MCP Server negotiate tool and negotiateAndVerify pipeline E2E tests (mcp-negotiate.test.ts, pipeline.test.ts)
- [x] 02-04-PLAN.md -- SDK generated code compilation and execution validation (sdk-compile.test.ts)

#### Phase 3: Playground Web UI
**Goal**: Developers can visually compose, send, and debug negotiate requests through a web interface without needing CLI or API knowledge
**Depends on**: Phase 1
**Requirements**: PLAYGROUND-01, PLAYGROUND-02, PLAYGROUND-03, PLAYGROUND-04, PLAYGROUND-05
**Success Criteria** (what must be TRUE):
  1. Playground Web UI loads with left-right split layout: left panel contains Schema editor and Provider selector, right panel shows response viewer
  2. User can write/edit JSON Schema with syntax highlighting and formatting, select a provider from installed packs (with base_url configuration), and send a negotiate request
  3. User sees the negotiate response with returned Schema and generated SDK code (TypeScript and Python tabs), and can run a mock test against the returned Schema to see pass/fail results
**Plans**: 7 plans (4 core + 3 gap closure)
**UI hint**: yes

Plans:
- [x] 03-01-PLAN.md -- Vite SPA scaffolding, state management, API client, CodeMirror hook, foundational components (ResizablePanel/Dialog/StatusBar)
- [x] 03-02-PLAN.md -- LEFT panel (ProviderSelector cards) + CENTER panel (SchemaEditor CodeMirror + ActionBar + useNegotiate/useExecute hooks)
- [x] 03-03-PLAN.md -- RIGHT panel (6-tab ResponseViewer) + MockTestSection + useMockTest hook
- [x] 03-04-PLAN.md -- App.tsx three-panel layout wiring + integration tests (api.test.ts, App.test.tsx)
- [x] 03-05-PLAN.md -- Gap closure: Wire Execute button onClick + fix Mock test hardcoded passed:true
- [x] 03-06-PLAN.md -- Gap closure: Add service.base_url to API GET /providers + extend Playground data layer for base_url support
- [x] 03-07-PLAN.md -- Gap closure: Display base_url on ProviderCard + inline override input in ProviderSelector + wire through negotiate/execute hooks

#### Phase 4: Provider Smoke Tests
**Goal**: Real provider API integrations (OpenAI, Replicate) are verified working with real API keys through an automated smoke test framework
**Depends on**: Phase 1
**Requirements**: SMOKE-01, SMOKE-02, SMOKE-03, SMOKE-04
**Success Criteria** (what must be TRUE):
  1. Smoke test framework supports API key injection (env/CLI/config), timeout control, and skip markers for unavailable providers
  2. OpenAI chat completions and Replicate smoke tests pass against live production APIs
  3. `synapse smoke --provider <name>` CLI command runs specific provider smoke tests and displays structured pass/fail results per test case
**Plans**: 1 plan

Plans:
- [x] 04-01-PLAN.md — Smoke test framework (vault-bridge + OpenAI/Replicate test cases) + `synapse smoke` CLI

### v1.2 Router Integration (Planned)

**Milestone Goal:** Router 从"CLI 工具"进化到"SDK 生成引擎"。核心变化：明确 Router 是开发时工具，输出纯代码 SDK，运行时路径无 LLM 无 Router。

#### Phase 5: Router as SDK Generator
**Goal**: Router 的输出产物从 CLI 命令行的调用转变为 SDK 生成。connect 命令保留作为开发调试用途，核心新路径是 `synapse evolve` → SDK 输出 → 应用集成。
**Depends on**: Phase 4
**Requirements**: GEN-01, GEN-02, GEN-03
**Success Criteria** (what must be TRUE):
  1. `synapse evolve` 命令读取 provider-card.json + DSL，输出完整 SDK 包（含类型定义、方法、测试桩）
  2. 生成的 SDK 零运行时依赖，只使用原生 fetch
  3. 生成的 SDK 可独立 npm install / pip install，不依赖 @synapse-router/*
  4. 运行时路径无 LLM、无随机、无网络外依赖（纯代码逻辑）
**Plans**: 3 plans

Plans:
- [x] 05-01-PLAN.md — `synapse evolve` 基础命令（读取 provider packs → 协商 → 生成 SDK 到指定目录）
- [x] 05-02-PLAN.md — SDK 生成增强（含环境配置入口、错误处理、重试逻辑、`.synapse/` 日志钩子）
- [x] 05-03-PLAN.md — 应用集成流程（README 示例、`synapse init` 初始化项目 SDK）

### v2.0 Offline Evolution (Planned)

**Milestone Goal:** 建立完整的"开发时协商 → 运行时纯 SDK → 产线日志 → Git 同步 → 下一轮迭代"闭环。Watchdog 监控产线异常，自动创建 Issue 推动迭代。

#### Phase 6: Local Evolution Engine
**Goal**: 实现 `.synapse/` 日志系统、watchdog 监控、export/import 数据同步、和 `synapse evolve` 完整演化流程。**运行时路径保持极薄**，所有复杂逻辑在独立进程中。
**Depends on**: Phase 5
**Requirements**: EVOLVE-01, EVOLVE-02, EVOLVE-03, EVOLVE-04
**Success Criteria** (what must be TRUE):
  1. SDK 运行时只做一行 JSON append 到 `.synapse/watchdog/events.ndjson`，零其他开销
  2. `synapse watchdog` 独立进程读取事件流，按规则匹配，正常时无操作，致命错误自动 `gh issue create`
  3. `.synapse/` 目录可通过 Git 从产线同步到开发环境（`synapse export`/`synapse import` 辅助）
  4. `synapse evolve` 读取产线日志 + Registry Provider Pack，生成新 SDK，应用替换后自测 → 提交
**Plans**: 4 plans

Plans:
- [x] 06-01-PLAN.md — `.synapse/` 运行时日志系统 + Provider Profile 聚合
- [x] 06-02-PLAN.md — `synapse watchdog` 规则引擎 + 自动 Issue 创建
- [x] 06-03-PLAN.md — `synapse export`/`import` + `.synapse/` Git 同步方案
- [x] 06-04-PLAN.md — `synapse evolve` 完整演化闭环（读 .synapse/ → 读 Provider Packs → 协商 → 生成 SDK）

#### Phase 7: Registry-Router Collaboration
**Goal**: Registry 的 Provider API change-detector 通过 `synapse evolve` 影响 SDK 生成，形成 Registry ↔ Router ↔ 应用的完整生态闭环。
**Depends on**: Phase 6 + synapse-registry Phase 3+
**Requirements**: COEVOLVE-01, COEVOLVE-02, COEVOLVE-03
**Success Criteria** (what must be TRUE):
  1. Registry 检测到 Provider API 变更 → 触发 `synapse evolve` 重新协商（开发时，非运行时）
  2. `synapse evolve` 可接受 registry 推送的变更通知作为输入
  3. 应用侧可选接收"有新 SDK 可用"的通知
**Plans**: 3 plans

Plans:
- [x] 07-01-PLAN.md — Registry 变更通知 → `synapse evolve` 触发链路
- [x] 07-02-PLAN.md — `synapse evolve` registry 数据源集成（拉取最新 pack，对比本地版本）
- [x] 07-03-PLAN.md — SDK 版本通知（CI/CD 集成：检测新 SDK 可用 → 自动 PR）

### v2.1 Billing Integration (Planned)

**Milestone Goal:** Integrate `@synapse-router/billing` v0.1.0 with Connector wrapper, SDK Generator pricing emission, and CLI billing commands. Enable API call metering, quota management, and graceful degradation without violating zero-dependency or wrapper-pattern constraints.

#### Phase 8: Connector Wrapper + FileQuotaStorage
**Goal**: Developers can wrap any connector with billing -- pre-call quota checking, post-call usage recording, file-based quota persistence, and graceful billing error handling -- without modifying connector internals
**Depends on**: Phase 7
**Requirements**: WRAPPER-01, WRAPPER-02, WRAPPER-03, WRAPPER-04, WRAPPER-05
**Success Criteria** (what must be TRUE):
  1. Developer calls `createBillingConnector(connector, config)` and receives a billing-aware connector that checks quota pre-call and records usage post-call
  2. Quota state persists across CLI invocations via `FileQuotaStorage` writing to `~/.synapse/quotas/<provider>.json` using atomic `.tmp + rename` writes
  3. Provider pack `provider-card.json` pricing fields (`{input, output, unit}`) are automatically bridged to billing `PricingRule` format via the pricing bridge function, with sensible defaults for missing fields
  4. Billing errors (config missing, quota exhausted, storage write failure) do not block API calls -- default behavior is `warn`, configurable to `reject`/`downgrade`/`notify` per strategy
  5. Every connector response includes billing metadata: call count, remaining quota, and estimated cost as a `BillingResult` envelope on the response object
**Research flags**: Standard mode (skip research-phase) -- wrapper pattern already mature in the codebase
**Plans**: 2 plans

Plans:
- [x] 08-01-PLAN.md -- Type foundation + FileQuotaStorage (WRAPPER-02) + pricing-bridge (WRAPPER-03)
- [x] 08-02-PLAN.md -- BillingConnector Wrapper (WRAPPER-01, WRAPPER-04, WRAPPER-05) + index exports

#### Phase 9: SDK Pricing Emission ✅
**Goal**: SDK Generator emits a standalone, zero-dependency `BillingTracker` class alongside generated SDK code when `--with-billing` flag is active
**Depends on**: Phase 8 (needs billing types and pricing bridge from Phase 8)
**Requirements**: SDKBILL-01, SDKBILL-02, SDKBILL-03
**Success Criteria** (what must be TRUE):
  1. ✅ `sdk-generator --with-billing` flag causes billing tracking code to be emitted alongside the SDK, without importing any `@synapse-router/*` package
  2. ✅ Generated `BillingTracker` class is a standalone zero-dependency class with inline pricing constants (no async imports, no external dependencies)
  3. ✅ SDK generation outputs a companion directory at `.synapse/billing/` containing the billing tracker source file and pricing configuration for the generated SDK
**Plans**: 2 plans

Plans:
- [x] 09-01: BillingTracker code generator (billing.ts + billing.test.ts + dependency setup)
- [x] 09-02: withBilling pipeline wiring (generator.ts + integration tests)
#### Phase 10: CLI Billing Commands
**Goal**: Users can initialize, configure, and inspect billing state via CLI commands, and `synapse connect` automatically wraps the connector with billing
**Depends on**: Phase 8 (requires wrapper), optionally Phase 9
**Requirements**: CLIBILL-01, CLIBILL-02, CLIBILL-03, CLIBILL-04
**Success Criteria** (what must be TRUE):
  1. `synapse billing init` guides the user through pricing strategy selection and quota limit configuration, writing to `.synapse/billing-config.json`
  2. `synapse billing config` (and `synapse config set billing.*`) allows viewing and modifying billing configuration with immediate validation
  3. `synapse billing status` displays per-provider remaining quota, reset time, and estimated cost summary in a readable table format
  4. `synapse connect` automatically detects billing configuration and wraps the connector with `createBillingConnector()`, no manual wrapping required
**Research flags**: Needs deep research -- Provider real pricing data (manual collection from OpenAI/Replicate/Stability/ComfyUI official pricing pages)
**Plans**: TBD

## Progress

**Execution Order:** Phase 2 -> Phase 3 -> Phase 4 -> Phase 5 -> Phase 6 -> Phase 7 -> Phase 8 -> Phase 9 -> Phase 10

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Negotiator Reliability | v1.0 | 4/4 | Complete | 2026-05-07 |
| 2. E2E End-to-End Testing | v1.1 | 4/4 | Complete | 2026-05-08 |
| 3. Playground Web UI | v1.1 | 7/7 | Complete | 2026-05-09 |
| 4. Provider Smoke Tests | v1.1 | 1/1 | Complete | 2026-05-09 |
| 5. Router as SDK Generator | v1.2 | 3/3 | Complete | 2026-05-09 |
| 6. Local Evolution Engine | v2.0 | 4/4 | Complete | 2026-05-09 |
| 7. Collaborative Evolution | v2.0 | 3/3 | Complete | 2026-05-09 |
| 8. Connector Wrapper + FileQuotaStorage | v2.1 | 1/2 | In Progress|  |
| 9. SDK Pricing Emission | v2.1 | 0/2 | Planned | - |
| 10. CLI Billing Commands | v2.1 | 0/0 | Not started | - |

## Post-Roadmap Enhancement: Router Package Rewrite (2026-05-09)

After all 7 phases shipped, `packages/router/` was rewritten from a 45-line stub into a full multi-dimensional scoring routing engine:

| Metric | Before | After |
|--------|--------|-------|
| Lines of code | 45 | ~1,400 |
| Tests | 4 | 55 |
| Architecture | Hardcoded strategy→provider map | Pure-function scorers × 5 dimensions |
| Strategies | 3 (cheap/fast/quality) | 5 + custom |
| CLI command | None | `synapse route <intent>` |
| Evolve integration | None | `synapse evolve --tune` |

### New CLI Commands
- `synapse route <intent>` — Multi-dimensional routing with scoring transparency
- `synapse evolve --tune` — Offline strategy weight tuning from production profiles

### New router capabilities
- `excludeProviders`, `region` (geographic match bonus), `minVersion` (model version filter)
- `registerCustomStrategy()` API + config persistence via `synapse config set route.strategies.*`
- Decision explanation (score breakdown, failover chain) in every route result
