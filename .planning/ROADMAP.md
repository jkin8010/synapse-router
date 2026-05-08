# Roadmap: Synapse Router

## Milestones

- **v1.0 Negotiator Reliability** — Phase 1 (shipped 2026-05-07)
- **v1.1 Testing & Playground** — Phases 2-4 (in progress)

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
- [ ] 03-05-PLAN.md -- Gap closure: Wire Execute button onClick + fix Mock test hardcoded passed:true
- [ ] 03-06-PLAN.md -- Gap closure: Add service.base_url to API GET /providers + extend Playground data layer for base_url support
- [ ] 03-07-PLAN.md -- Gap closure: Display base_url on ProviderCard + inline override input in ProviderSelector + wire through negotiate/execute hooks

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
| 1. Negotiator Reliability | v1.0 | 4/4 | Complete | 2026-05-07 |
| 2. E2E End-to-End Testing | v1.1 | 0/0 | Not started | - |
| 3. Playground Web UI | v1.1 | 4/7 | Gap Closure | 2026-05-08 |
| 4. Provider Smoke Tests | v1.1 | 0/0 | Not started | - |
