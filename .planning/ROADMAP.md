# Roadmap: Synapse Router

## Milestones

- ✅ **v1.0 Negotiator Reliability** — Phase 1 (shipped 2026-05-07)
- ✅ **v1.1 Testing & Playground** — Phases 2-4 (shipped 2026-05-09)
- ✅ **v1.2 Router Integration** — Phase 5 (shipped)
- ✅ **v2.0 Offline Evolution** — Phases 6-7 (shipped)
- ✅ **v2.1 Billing Integration** — Phases 8-10 (shipped 2026-05-19)
- ✅ **v3.0 AI Agent Skill Distribution** — Phases 11-12 (shipped 2026-05-21)
- 📋 **v4.0 Documentation & Playground** — Phases 13-16 (in progress)
- 📋 **v5.0 交互式协商与体验优化** — Phases 17-20 (planned)

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

### Phase 13: Docs Scaffold + Playground Infra
**Goal**: Docusaurus docs site skeleton is operational and playground API calls no longer hardcode localhost
**Depends on**: Nothing (first phase of v4.0)
**Requirements**: INFRA-01, INFRA-02, INFRA-03
**Success Criteria** (what must be TRUE):
  1. Developer can run `pnpm build:docs` and see a functioning Docusaurus v3 site at `apps/docs/` with default homepage and sidebar
  2. Running `pnpm build` does not trigger Docusaurus build (no webpack/Vite conflict with main pipeline)
  3. Playground API calls use relative `/api` prefix and work through Vite proxy in both dev and production
  4. Docs site is registered in pnpm workspace as `@synapse-router/docs` (private) and imports resolve correctly
**Plans**: 3 plans

Plans:
- [x] 17-01-PLAN.md — Install @inquirer/prompts, picocolors; create utils/tty.ts (isInteractive), utils/prompts.ts (wrapper functions)
- [x] 17-02-PLAN.md — Extract packs.ts (findPacksDir, loadProviderCard), extract negotiate.ts; add --yes/--dry-run/--no-save/--no-interactive flags
- [x] 17-03-PLAN.md — Refactor setup.ts and billing.ts init to use shared prompts.ts

### Phase 14: Documentation Site Content
**Goal**: Developers can read Getting Started guide and complete CLI command reference on the docs site
**Depends on**: Phase 13 (Docusaurus scaffold required before adding content)
**Requirements**: DCOC-01, DCOC-02
**Success Criteria** (what must be TRUE):
  1. Visitor can read a "Getting Started" page covering installation, first configuration, and first `synapse connect` call
  2. Visitor can browse a complete CLI command reference with all commands, parameter tables, and examples
  3. All pages are navigable via Docusaurus sidebar and render correctly on mobile viewports
**Plans**: 3 plans

Plans:
- [ ] 17-01-PLAN.md — Install @inquirer/prompts, picocolors; create utils/tty.ts (isInteractive), utils/prompts.ts (wrapper functions)
- [ ] 17-02-PLAN.md — Extract packs.ts (findPacksDir, loadProviderCard), extract negotiate.ts; add --yes/--dry-run/--no-save/--no-interactive flags
- [ ] 17-03-PLAN.md — Refactor setup.ts and billing.ts init to use shared prompts.ts

### Phase 15: Playground Core UI Upgrade
**Goal**: Playground is usable on any screen size, with key status visibility and workflow-enhancing interactions
**Depends on**: Phase 13 (Vite proxy fix required before UI enhancements)
**Requirements**: PLAY-01, PLAY-02, PLAY-03, PLAY-04, PLAY-05
**Success Criteria** (what must be TRUE):
  1. User sees responsive layout adapting correctly at >1440px (3-column), 1024-1440px (collapsible sidebar), and <1024px (stacked tabs)
  2. User can open Add Pack dialog, search for Provider Packs, and select one to install
  3. Each Provider card shows a clear key status indicator ("configured" / "no key")
  4. Hovering over a disabled action button shows a tooltip explaining why it is unavailable
  5. User can use Cmd+Enter to execute a request and Cmd+Shift+Enter to trigger negotiation
**Plans**: 2 plans

Plans:
- [ ] 15-01-PLAN.md -- Foundation: context.ts types (configured, activePanel), index.css breakpoints + responsive grid CSS, useKeyboardShortcut hook
- [ ] 15-02-PLAN.md -- Components + Layout: App.tsx responsive grid + sidebar collapse + keyboard shortcuts, ProviderSelector collapsed mode + Add Pack dialog + configured wiring, ActionBar tooltips + kbd hints, StatusBar configured count
**UI hint**: yes

**Note:** Phases 14 and 15 are independent of each other and can be partially parallelized.

### Phase 16: Negotiator CLI Integration
**Goal**: `synapse negotiate` CLI 命令真正调用 `@synapse-router/negotiator` 包的完整协商管道（LLM Schema 生成 → Manifest 字段级匹配 → Mock 测试 → Schema Lock 保存）
**Depends on**: Nothing (Phase 1 Negotiator Reliability 已完成，negotiator 包已实现但未接入 CLI)
**Requirements**: None
**Success Criteria** (what must be TRUE):
  1. `synapse negotiate --intent X --provider Y` 调用 `negotiateAndVerify()` 全链路
  2. LLM API Key 从 Vault 读取（key 名 `negotiator-llm`）
  3. 输出显示协商详细报告：Schema 字段、Manifest 匹配、Mock 测试结果、Lock 保存确认
  4. 无 vault key 时降级为确定性 stub（不报错、不阻塞）
  5. `--no-cache` 跳过缓存强制重新协商
**Plans**: TBD
### Phase 17: CLI Infrastructure
**Goal**: CLI command infrastructure is extracted and shared, interactive prompt utilities exist independently of index.ts
**Depends on**: Phase 16 (Negotiator CLI Integration provides the negotiate pipeline before adding interactive flow)
**Requirements**: CLI-INFRA-01, CLI-INFRA-02, CLI-INFRA-03, CLI-INFRA-04, CLI-INFRA-05, CLI-INFRA-06
**Success Criteria** (what must be TRUE):
  1. `negotiate()` extracted from `apps/cli/src/index.ts` to `apps/cli/src/commands/negotiate.ts` following existing command pattern
  2. `apps/cli/src/utils/prompts.ts` exists with `@inquirer/prompts` wrappers for all prompt types
  3. `apps/cli/src/utils/tty.ts` exists with `isInteractive()` checking stdin/stdout TTY + CI env vars + `--no-interactive` flag
  4. CLI supports `--yes` (skip all prompts), `--dry-run` (preview no save), `--no-save` (don't save Lock) global flags
  5. `findPacksDir()` and `loadProviderCard()` extracted from index.ts to shared utility
  6. `setup.ts`, `connect.ts`, `billing.ts` migrated from local prompt calls to shared `utils/prompts.ts`
  7. All existing tests pass without modification
**Plans**: 3 plans

Plans:
- [ ] 17-01-PLAN.md — Install @inquirer/prompts, picocolors; create utils/tty.ts (isInteractive), utils/prompts.ts (wrapper functions)
- [ ] 17-02-PLAN.md — Extract packs.ts (findPacksDir, loadProviderCard), extract negotiate.ts; add --yes/--dry-run/--no-save/--no-interactive flags
- [ ] 17-03-PLAN.md — Refactor setup.ts and billing.ts init to use shared prompts.ts

### Phase 18: Interactive Negotiation
**Goal**: Developers can run `synapse negotiate` interactively to review schemas, customize fields, and route post-negotiation
**Depends on**: Phase 17 (shared prompts and TTY detection required for interactive flow)
**Requirements**: NEGO-01, NEGO-02, NEGO-03, NEGO-04, NEGO-05, NEGO-06, NEGO-07, NEGO-08, NEGO-09, NEGO-10
**Success Criteria** (what must be TRUE):
  1. `synapse negotiate` (no flags) starts interactive flow: select intent -> select provider -> review schema -> confirm
  2. Input/output schema fields displayed with required/optional marking and field constraints
  3. User can toggle optional fields on/off with multi-select prompt, supporting batch operations
  4. LLM API Key discovered from vault/config/env before negotiation; if no key found, user guided to configure one
  5. Stub output clearly marked when using deterministic stub (no LLM key) with visible warning
  6. Lock diff preview shown before save, comparing new Lock with existing Lock (if any)
  7. Post-negotiation menu offers: test connect / generate SDK / view @synapse-router/sdk integration / exit
  8. `--intent X --provider Y` (non-interactive mode) preserves existing behavior unchanged
  9. SIGINT/SIGTERM handled gracefully: partial state cleaned up, no orphan Lock files
  10. Prompts classified as required/recommended/contextual/confirmation; Enter accepts default value
**Plans**: 3 plans

Plans:
- [x] 18-01-PLAN.md — Interactive mode entry point: intent collection and provider selection via promptSearch/promptSelect
- [x] 18-02-PLAN.md — Schema display with picocolors, field checkbox toggling, LLM key detection + stub warning, negotiateAndVerify
- [x] 18-03-PLAN.md — Lock diff preview, post-negotiation routing menu, SIGINT/SIGTERM cleanup, non-interactive preservation

### Phase 19: Command Simplification
**Goal**: CLI help output is organized, command duplication is reduced, help text is shared with docs site
**Depends on**: Nothing (can be done independently)
**Requirements**: CMD-01, CMD-02, CMD-03
**Success Criteria** (what must be TRUE):
  1. `--help` output organized into 5 categories: Getting Started, Core Workflow, Provider Management, Configuration, Advanced
  2. Command merging feasibility evaluated and documented for: provider->pack, smoke->connect, init->setup, profile->config, export/import->config
  3. Help text definitions extracted to shared location that stays in sync with docs site
**Plans**: 3 plans

Plans:
- [ ] 17-01-PLAN.md — Install @inquirer/prompts, picocolors; create utils/tty.ts (isInteractive), utils/prompts.ts (wrapper functions)
- [ ] 17-02-PLAN.md — Extract packs.ts (findPacksDir, loadProviderCard), extract negotiate.ts; add --yes/--dry-run/--no-save/--no-interactive flags
- [ ] 17-03-PLAN.md — Refactor setup.ts and billing.ts init to use shared prompts.ts

### Phase 20: Docs + Playground Updates
**Goal**: Documentation is updated for v5.0 changes, Playground has SDK preview and schema presets
**Depends on**: Phase 18 (negotiate interactive flow must exist before documenting it), Phase 19 (command simplification must be final before updating CLI reference)
**Requirements**: DOCS-01, DOCS-02, DOCS-03, PLAY-06, PLAY-07, PLAY-08
**Success Criteria** (what must be TRUE):
  1. `negotiate` command doc updated with interactive negotiation flow description
  2. "User Journey" doc created: install -> negotiate -> connect/evolve/sdk integration
  3. CLI command reference updated to reflect any command simplifications from Phase 19
  4. Playground auto-preview shows generated SDK code when Schema changes (debounced)
  5. Playground has 3 built-in schema presets (Chat, Text-to-Image, Embedding) + localStorage custom presets
  6. Playground shows estimated billing cost for current Schema
**Plans**: 3 plans

Plans:
- [ ] 17-01-PLAN.md — Install @inquirer/prompts, picocolors; create utils/tty.ts (isInteractive), utils/prompts.ts (wrapper functions)
- [ ] 17-02-PLAN.md — Extract packs.ts (findPacksDir, loadProviderCard), extract negotiate.ts; add --yes/--dry-run/--no-save/--no-interactive flags
- [ ] 17-03-PLAN.md — Refactor setup.ts and billing.ts init to use shared prompts.ts
**UI hint**: yes

## Progress

**Execution Order:** Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5 -> Phase 6 -> Phase 7 -> Phase 8 -> Phase 9 -> Phase 10 -> Phase 11 -> Phase 12 -> Phase 13 -> Phase 14 -> Phase 15 -> Phase 16 -> Phase 17 -> Phase 18 -> Phase 19 -> Phase 20

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
| 13. Docs Scaffold + Playground Infra | v4.0 | 0/0 | Planned | - |
| 14. Documentation Site Content | v4.0 | 0/0 | Planned | - |
| 15. Playground Core UI Upgrade | v4.0 | 0/2 | Planned | - |
| 16. Negotiator CLI Integration | v4.0 | 1/1 | Complete | 2026-05-25 |
| 17. CLI Infrastructure | v5.0 | 3/3 | Complete    | 2026-05-25 |
| 18. Interactive Negotiation | v5.0 | 3/3 | Complete   | 2026-05-25 |
| 19. Command Simplification | v5.0 | 0/0 | Planned | - |
| 20. Docs + Playground Updates | v5.0 | 0/0 | Planned | - |

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
