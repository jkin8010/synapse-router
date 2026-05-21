# Phase 14: Documentation Site Content - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

为已搭建的 Docusaurus 文档站点（Phase 13）填充内容：编写 Getting Started 入门指南和完整的 CLI 命令参考。SDK Guide 初步内容也在此阶段覆盖。

**DCOC-01**: 入门指南 — 基于项目现有上下文编写，覆盖安装、配置、首次 connect 的完整流程
**DCOC-02**: CLI 命令参考 — 基于 CLAUDE.md 整理所有命令，每命令组独立页面

</domain>

<decisions>
## Implementation Decisions

### Content Structure
- **D-01:** 填充全部 3 个文档入口：Getting Started（intro.md）、CLI Reference（cli/）、SDK Guide（sdk/），不限于 DCOC 要求
- **D-02:** SDK Guide 至少覆盖 `synapse evolve` 使用方式

### Getting Started 格式
- **D-03:** 单页面指南（`docs/intro.md` 既是 Overview 也是 Getting Started），整合 install → configure → first connect 完整流程
- **D-04:** 指南内链接到 API Reference（`api.md`）和 Pack Development Guide（`packs.md`），形成文档网络

### CLI 命令参考格式
- **D-05:** 每个命令组独立子页面（`docs/cli/connect.md`、`docs/cli/vault.md` 等），非单页面
- **D-06:** cli/index.md 作为 CLI Reference 概览入口，列出所有命令表和快速导航

### 代码示例
- **D-07:** 丰富示例 — 每个命令包含完整 JSON、参数、真实 Provider ID（deepseek, openai），强调可复制粘贴
- **D-08:** 关键命令（connect, vault, evolve, route）优先提供最详细的示例

### 文档语言
- **D-09:** AI 优化混合风格 — 主体使用中文，首次出现的专业术语附加英文原名括号标注（如 "Schema 协商（Schema Negotiation）"），便于 AI Agent 解析和交叉引用

### 引用规范
- **D-10:** Getting Started 中引用 API Reference 和 Pack Development Guide 使用 Docusaurus 内部链接（`/docs/api`、`/docs/packs`），不重复内容

### Claude's Discretion
- CLI 子页面的具体分组方式（哪些命令放一起）
- SDK Guide 的详细程度（基础覆盖 evolve 流程即可）
- 页面内部的锚点和层级结构
- 示例中的具体 JSON 格式细节

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `CLAUDE.md` — 所有 CLI 命令的权威文档源（57 处 synapse 引用），包含 connect/setup/config/vault/lock/sdk/pack/billing/route/evolve 的完整参数说明
- `.planning/REQUIREMENTS.md` §DCOC — DCOC-01 和 DCOC-02 的验收标准

### Docusaurus 站点已有内容
- `apps/docs/docs/intro.md` — 当前 Overview 页面（已有完整项目介绍，需作为 Getting Started 入口）
- `apps/docs/docs/cli/index.md` — CLI Reference 入口（当前为空占位，需重写为概览页）
- `apps/docs/docs/sdk/index.md` — SDK Guide 入口（当前为空占位，需填充基础内容）
- `apps/docs/docs/api.md` — API Reference（已有内容，引用目标）
- `apps/docs/docs/packs.md` — Pack Development Guide（已有内容，引用目标）
- `apps/docs/docusaurus.config.ts` — Docusaurus 配置，nav items 链接到 `/docs/cli` 和 `/docs/sdk`

### Phase 13 决策
- `.planning/phases/13-docs-scaffold-playground-infra/13-CONTEXT.md` — D-01 到 D-16 决策，包括侧边栏自动生成、导航结构、品牌配色等

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/docs/docs/intro.md` — 已有完整 Overview 内容，包含项目定位和架构概要
- `CLAUDE.md` §Synapse CLI — 完整的 CLI 命令文档（参数、示例、子命令），可直接转化为 Docusaurus 页面
- `docs/API.md` 和 `docs/PACKS.md` — 已复制到 `apps/docs/docs/`，可作为跨引用目标

### Established Patterns
- auto-generated sidebar（Phase 13 D-01）：新的 CLI 子页面只需放在 `docs/cli/` 目录下，侧边栏自动生成
- Infima CSS 样式（无 TailwindCSS）：内容页面保持 Docusaurus 默认样式，无需额外 CSS
- 三栏目导航：Overview/CLI Reference/SDK Guide（Phase 13 D-03）

### Integration Points
- `apps/docs/docs/cli/` — 添加 `connect.md`、`vault.md`、`billing.md`、`route.md`、`evolve.md`、`pack.md`、`lock.md`、`config.md`、`setup.md` 等子页面
- `apps/docs/docs/cli/index.md` — 重写为命令概览表
- `apps/docs/docs/intro.md` — 添加 Getting Started 内容（install/configure/connect）
- `apps/docs/docs/sdk/index.md` — 填充 evolve 使用说明

</code_context>

<specifics>
## Specific Ideas

- Getting Started 页面结构建议：项目简介 → 安装 → Provider 配置 → 首次 connect → 后续步骤
- CLI 子页面建议分组：core (connect/route/evolve) / config (setup/config) / management (vault/billing/pack/lock) / misc (smoke)
- 每个 CLI 页面格式：命令概述 → 参数表 → 示例（至少 2 个）→ 注意事项

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-documentation-site-content*
*Context gathered: 2026-05-21*
