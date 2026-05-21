# Roadmap: Synapse Router

## Milestones

- ✅ **v1.0 Negotiator Reliability** — Phase 1 (shipped 2026-05-07)
- ✅ **v1.1 Testing & Playground** — Phases 2-4 (shipped 2026-05-09)
- ✅ **v1.2 Router Integration** — Phase 5 (shipped)
- ✅ **v2.0 Offline Evolution** — Phases 6-7 (shipped)
- ✅ **v2.1 Billing Integration** — Phases 8-10 (shipped 2026-05-19)
- ✅ **v3.0 AI Agent Skill Distribution** — Phases 11-12 (shipped 2026-05-21)
- 📋 **v4.0 Documentation Site** — Phase 13 (planned)

## Phase Details

<details>
<summary>✅ v1.0 Negotiator Reliability (Phase 1) — SHIPPED 2026-05-07</summary>

### Phase 1: Negotiator Reliability
**Goal**: Full contract verification loop: Schema negotiation -> Manifest matching -> SDK code generation -> Mock test -> Registry async submission
**Plans**: 7 plans (4 core + 3 gap closure)

Plans:
- [x] 01-01: Contract Mocker package -- zero-dependency HTTP Mock Server
- [x] 01-02: Manifest types and matching -- constraint definitions + three diff detection types
- [x] 01-03: Pipeline + retry logic -- negotiateAndVerify full-chain orchestration
- [x] 01-04: Registry integration -- Fire-and-forget async verification submission

</details>

<details>
<summary>✅ v1.1 Testing & Playground (Phases 2-4) — SHIPPED 2026-05-09</summary>

#### Phase 2: E2E End-to-End Testing
**Goal**: Core workflows are covered by automated E2E tests that validate the full negotiate-and-verify pipeline from multiple entry points
**Plans**: 7 plans (4 core + 3 gap closure)
- [x] 02-01 -- E2E test framework infrastructure
- [x] 02-02 -- CLI connect and API /negotiate entry point E2E tests
- [x] 02-03 -- MCP Server negotiate tool and pipeline E2E tests
- [x] 02-04 -- SDK generated code compilation and execution validation

#### Phase 3: Playground Web UI
**Goal**: Developers can visually compose, send, and debug negotiate requests through a web interface
**Plans**: 7 plans
- [x] 03-01 -- Vite SPA scaffolding, state management, CodeMirror
- [x] 03-02 -- ProviderSelector + SchemaEditor + ActionBar
- [x] 03-03 -- ResponseViewer + MockTestSection
- [x] 03-04 -- App.tsx three-panel layout + integration tests
- [x] 03-05 through 03-07 -- Gap closures

#### Phase 4: Provider Smoke Tests
**Goal**: Real provider API integrations verified with an automated smoke test framework
**Plans**: 1 plan
- [x] 04-01 -- Smoke test framework + CLI command

</details>

<details>
<summary>✅ v1.2 Router Integration (Phase 5) — SHIPPED</summary>

#### Phase 5: Router as SDK Generator
**Goal**: Router outputs SDK code instead of CLI calls. `synapse evolve` is the new core path.
**Plans**: 3 plans
- [x] 05-01 -- `synapse evolve` base command
- [x] 05-02 -- SDK generation enhancements
- [x] 05-03 -- Application integration flow

</details>

<details>
<summary>✅ v2.0 Offline Evolution (Phases 6-7) — SHIPPED</summary>

#### Phase 6: Local Evolution Engine
**Goal**: Complete `.synapse/` log system, watchdog, export/import, and evolve flow
**Plans**: 4 plans
- [x] 06-01 -- `.synapse/` runtime logging system
- [x] 06-02 -- watchdog rule engine + auto issue creation
- [x] 06-03 -- export/import + Git sync
- [x] 06-04 -- Full evolve loop

#### Phase 7: Registry-Router Collaboration
**Goal**: Registry change-detector triggers evolve flow
**Plans**: 3 plans
- [x] 07-01 -- Registry notification → evolve trigger
- [x] 07-02 -- evolve registry data source integration
- [x] 07-03 -- SDK version notification

</details>

<details>
<summary>✅ v2.1 Billing Integration (Phases 8-10) — SHIPPED 2026-05-19</summary>

#### Phase 8: Connector Wrapper + FileQuotaStorage
**Goal**: Billing wrapper and file-based quota storage without modifying connector internals
**Plans**: 2 plans
- [x] 08-01 -- Type foundation + FileQuotaStorage + pricing-bridge
- [x] 08-02 -- BillingConnector Wrapper + index exports

#### Phase 9: SDK Pricing Emission
**Goal**: SDK Generator emits BillingTracker with --with-billing flag
**Plans**: 2 plans
- [x] 09-01 -- BillingTracker code generator
- [x] 09-02 -- withBilling pipeline wiring

#### Phase 10: CLI Billing Commands
**Goal**: billing init/config/status commands and connect auto-wrap
**Plans**: 3 plans
- [x] 10-01 -- billing command module + init wizard
- [x] 10-02 -- billing config + billing status
- [x] 10-03 -- connect auto-wrap with billing

</details>

<details>
<summary>✅ v3.0 AI Agent Skill Distribution (Phases 11-12) — SHIPPED 2026-05-21</summary>

#### Phase 11: Skill 包创建与内容覆盖
**Goal**: AI Agent 开发者可以通过 npm / GitHub URL 获取 Synapse Router Skill
**Plans**: 4 plans
- [x] 11-01 -- Package scaffolding + skills/ directory structure
- [x] 11-02 -- Enhanced CLAUDE.md + root skill.md entry
- [x] 11-03 -- Claude Code skill.md + Cursor .cursorrules
- [x] 11-04 -- Codex/OpenClaw/Hermes agent config files

#### Phase 12: Install CLI + 自动化分发
**Goal**: One-command install CLI with auto-detection and CI/CD publishing
**Plans**: 2 plans
- [x] 12-01 -- install-skill CLI package (platform detection, install/uninstall, backup/manifest)
- [x] 12-02 -- CI/CD publish workflow (tag trigger, dual-package, GitHub Release)

</details>

## Progress

**Execution Order:** Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5 -> Phase 6 -> Phase 7 -> Phase 8 -> Phase 9 -> Phase 10 -> Phase 11 -> Phase 12

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Negotiator Reliability | v1.0 | 4/4 | Complete | 2026-05-07 |
| 2. E2E End-to-End Testing | v1.1 | 4/4 | Complete | 2026-05-08 |
| 3. Playground Web UI | v1.1 | 7/7 | Complete | 2026-05-09 |
| 4. Provider Smoke Tests | v1.1 | 1/1 | Complete | 2026-05-09 |
| 5. Router as SDK Generator | v1.2 | 3/3 | Complete | 2026-05-09 |
| 6. Local Evolution Engine | v2.0 | 4/4 | Complete | 2026-05-09 |
| 7. Collaborative Evolution | v2.0 | 3/3 | Complete | 2026-05-09 |
| 8. Connector Wrapper + FileQuotaStorage | v2.1 | 2/2 | Complete | 2026-05-19 |
| 9. SDK Pricing Emission | v2.1 | 2/2 | Complete | 2026-05-19 |
| 10. CLI Billing Commands | v2.1 | 3/3 | Complete | 2026-05-19 |
| 11. Skill 包创建与内容覆盖 | v3.0 | 4/4 | Complete | 2026-05-19 |
| 12. Install CLI + 自动化分发 | v3.0 | 2/2 | Complete | 2026-05-21 |
| 13. Documentation Site | v4.0 | 0/0 | Planned | - |

## Post-Roadmap Enhancement: Router Package Rewrite (2026-05-09)

After all 7 phases shipped, `packages/router/` was rewritten from a 45-line stub into a full multi-dimensional scoring routing engine:

| Metric | Before | After |
|--------|--------|-------|
| Lines of code | 45 | ~1,400 |
| Tests | 4 | 55 |
| Architecture | Hardcoded strategy->provider map | Pure-function scorers x 5 dimensions |
| Strategies | 3 (cheap/fast/quality) | 5 + custom |
| CLI command | None | `synapse route <intent>` |
| Evolve integration | None | `synapse evolve --tune` |
