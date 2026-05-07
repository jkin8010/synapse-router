# Roadmap: Synapse Router

## Milestones

- ✅ **v1.0 Negotiator Reliability** — Phase 1 (shipped 2026-05-07)
- 🚧 **v1.1 Testing & Playground** — Phases 2-4 (in progress)

## Phases

<details>
<summary>✅ v1.0 Negotiator Reliability (Phase 1) — SHIPPED 2026-05-07</summary>

### Phase 1: Negotiator 可靠性增强
**Goal**: 完整的契约验证闭环：Schema 协商 → Manifest 匹配 → SDK 代码生成 → Mock 测试 → Registry 异步提交
**Plans**: 4 plans

Plans:
- [x] 01-01: Contract Mocker 包 — 零依赖 HTTP Mock Server
- [x] 01-02: Manifest 类型与匹配 — 约束定义 + 三种差异检测
- [x] 01-03: Pipeline + 重试逻辑 — negotiateAndVerify 全链路编排
- [x] 01-04: Registry 集成 — Fire-and-forget 异步验证提交

</details>

### 🚧 v1.1 Testing & Playground (In Progress)

**Milestone Goal:** 建立完整的端到端测试覆盖和可视化调试界面，确保全链路可验证、可观测。

#### Phase 2: E2E End-to-End Testing
**Goal**: Core workflows are covered by automated E2E tests that validate the full negotiate-and-verify pipeline from multiple entry points
**Depends on**: Phase 1
**Requirements**: E2E-01, E2E-02, E2E-03, E2E-04, E2E-05, E2E-06
**Success Criteria** (what must be TRUE):
  1. E2E test framework (test runner, fixture management, assertion utilities) is operational and `pnpm test:e2e` invokes all E2E tests with structured output
  2. Three application entry point tests pass: CLI `synapse connect --task "..."` full flow, API `/negotiate` HTTP request/response, MCP Server negotiate tool
  3. Full-chain `negotiateAndVerify` pipeline test passes end-to-end (negotiate -> manifest match -> SDK code generation -> mock test with contract-mocker)
  4. SDK generated code during E2E tests compiles and executes successfully when imported, verifying no broken output
**Plans**: TBD

#### Phase 3: Playground Web UI
**Goal**: Developers can visually compose, send, and debug negotiate requests through a web interface without needing CLI or API knowledge
**Depends on**: Phase 1
**Requirements**: PLAYGROUND-01, PLAYGROUND-02, PLAYGROUND-03, PLAYGROUND-04, PLAYGROUND-05
**Success Criteria** (what must be TRUE):
  1. Playground Web UI loads with left-right split layout: left panel contains Schema editor and Provider selector, right panel shows response viewer
  2. User can write/edit JSON Schema with syntax highlighting and formatting, select a provider from installed packs (with base_url configuration), and send a negotiate request
  3. User sees the negotiate response with returned Schema and generated SDK code (TypeScript and Python tabs), and can run a mock test against the returned Schema to see pass/fail results
**Plans**: TBD
**UI hint**: yes

#### Phase 4: Provider Smoke Tests
**Goal**: Real provider API integrations (OpenAI, Replicate) are verified working with real API keys through an automated smoke test framework
**Depends on**: Phase 1
**Requirements**: SMOKE-01, SMOKE-02, SMOKE-03, SMOKE-04
**Success Criteria** (what must be TRUE):
  1. Smoke test framework supports API key injection (env/CLI/config), timeout control, and skip markers for unavailable providers
  2. OpenAI chat completions and Replicate smoke tests pass against live production APIs
  3. `synapse smoke --provider <name>` CLI command runs specific provider smoke tests and displays structured pass/fail results per test case
**Plans**: TBD

## Progress

**Execution Order:** Phase 2 -> Phase 3 -> Phase 4

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Negotiator 可靠性增强 | v1.0 | 4/4 | Complete | 2026-05-07 |
| 2. E2E End-to-End Testing | v1.1 | 0/0 | Not started | - |
| 3. Playground Web UI | v1.1 | 0/0 | Not started | - |
| 4. Provider Smoke Tests | v1.1 | 0/0 | Not started | - |
