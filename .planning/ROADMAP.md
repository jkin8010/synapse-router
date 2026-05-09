# Roadmap: Synapse Router

## Milestones

- **v1.0 Negotiator Reliability** — Phase 1 (shipped 2026-05-07)
- **v1.1 Testing & Playground** — Phases 2-4 (in progress)
- **v1.2 Router Integration** — Phase 5 (planned)
- **v2.0 Offline Evolution** — Phases 6-7 (planned)

## Phases

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
- [ ] 02-01-PLAN.md -- E2E test framework infrastructure (helpers, fixtures, test:e2e script)
- [ ] 02-02-PLAN.md -- CLI connect and API /negotiate entry point E2E tests
- [ ] 02-03-PLAN.md -- MCP Server negotiate tool and negotiateAndVerify pipeline E2E tests
- [ ] 02-04-PLAN.md -- SDK generated code compilation and execution validation

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
**Plans**: TBD

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
- [ ] 05-01-PLAN.md — `synapse evolve` 基础命令（读取 provider packs → 协商 → 生成 SDK 到指定目录）
- [ ] 05-02-PLAN.md — SDK 生成增强（含环境配置入口、错误处理、重试逻辑、`.synapse/` 日志钩子）
- [ ] 05-03-PLAN.md — 应用集成流程（README 示例、`synapse init` 初始化项目 SDK）

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
- [ ] 06-01-PLAN.md — `.synapse/` 运行时日志系统 + Provider Profile 聚合
- [ ] 06-02-PLAN.md — `synapse watchdog` 规则引擎 + 自动 Issue 创建
- [ ] 06-03-PLAN.md — `synapse export`/`import` + `.synapse/` Git 同步方案
- [ ] 06-04-PLAN.md — `synapse evolve` 完整演化闭环（读 .synapse/ → 读 Provider Packs → 协商 → 生成 SDK）

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
- [ ] 07-01-PLAN.md — Registry 变更通知 → `synapse evolve` 触发链路
- [ ] 07-02-PLAN.md — `synapse evolve` registry 数据源集成（拉取最新 pack，对比本地版本）
- [ ] 07-03-PLAN.md — SDK 版本通知（CI/CD 集成：检测新 SDK 可用 → 自动 PR）

## Progress

**Execution Order:** Phase 2 -> Phase 3 -> Phase 4 -> Phase 5 -> Phase 6 -> Phase 7

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Negotiator Reliability | v1.0 | 4/4 | Complete | 2026-05-07 |
| 2. E2E End-to-End Testing | v1.1 | 0/0 | Not started | - |
| 3. Playground Web UI | v1.1 | 4/7 | Gap Closure | 2026-05-08 |
| 4. Provider Smoke Tests | v1.1 | 0/0 | Not started | - |
| 5. Router as SDK Generator | v1.2 | 0/3 | Planned | - |
| 6. Local Evolution Engine | v2.0 | 0/4 | Planned | - |
| 7. Registry-Router Collaboration | v2.0 | 0/3 | Planned | - |
