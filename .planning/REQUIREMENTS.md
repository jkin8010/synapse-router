# Synapse Router -- Requirements v4.0

## Milestone v4.0: Documentation & Playground

**Goal:** 为 Synapse Router 构建基础开发者文档站点 (Docusaurus) 和 Playground UI 基础升级

**范围：**
- 文档站点：入门指南 + CLI 命令参考（基于现有内容整理）
- Playground：响应式布局、Add Pack 对话框、密钥状态、tooltip、快捷键
- 基础设施：Docusaurus 脚手架、Vite proxy、构建隔离

---

## INFRA -- 基础设施

- [ ] **INFRA-01**: `apps/docs/` Docusaurus 脚手架 -- 在 apps/ 下创建 Docusaurus v3 站点，package.json 命名为 `@synapse-router/docs` (private)，集成到 pnpm workspace
- [ ] **INFRA-02**: Vite proxy 修复 -- 替换 Playground 中硬编码的 `localhost:3000` 为相对路径 `/api`，配置 Vite proxy
- [ ] **INFRA-03**: 构建隔离 -- 在根 package.json 添加 `build:docs` 脚本，docs 构建独立于主 `pnpm build` 管线

## DCOC -- 文档站点内容

- [ ] **DCOC-01**: 入门指南 -- 基于 `knowledge/usage-guide.md` 整理为 Docusaurus 格式，覆盖安装、配置、首次 connect
- [ ] **DCOC-02**: CLI 命令参考 -- 基于 CLAUDE.md 整理所有命令（connect/setup/config/vault/lock/sdk/pack/billing/route/evolve/smoke），包含参数说明和示例

## PLAY -- Playground UI 升级

- [ ] **PLAY-01**: 响应式布局 -- 实现 3 档断点（>1440px 三列、1024-1440px 可折叠侧栏、<1024px 顶部标签堆叠）
- [ ] **PLAY-02**: Add Pack 对话框 -- 将现有按钮接入交互式对话框，支持搜索和选择 Provider Pack
- [ ] **PLAY-03**: Provider 密钥状态指示 -- 在每个 Provider 卡片上显示 "未配置密钥" 或 "已配置" 状态
- [ ] **PLAY-04**: 禁用按钮 tooltip -- 当操作按钮因条件不满足禁用时，鼠标悬停显示简短的不可用原因
- [ ] **PLAY-05**: 键盘快捷键 -- 支持 Cmd+Enter（执行）/ Cmd+Shift+Enter（协商）

---

## Future Requirements (Deferred)

- TypeScript API 类型自动生成 (typedoc)
- 搜索功能 (Algolia DocSearch 或本地搜索)
- Pack 开发指南
- SDK 代码自动更新
- Schema 预设 (Presets)
- Billing 费用预览
- Provider 对比功能
- 版本化文档
- 可视化架构图 (Mermaid)

## Out of Scope

- 多语言文档 (i18n) — 文档使用英文，保持与代码一致
- 独立博客 — 仅保留 Changelog 部分
- 视频教程 / 交互式教程 — 文本 + 代码块即可
- 社区论坛 / 评论区 — GitHub Discussions 链接
- 共享 UI 组件库 (`@synapse-router/ui`) — React 版本冲突，且无复用场景
- Playground 后台 API 新增端点 — 所有 UI 升级基于现有 API

---

# Milestone v5.0: 交互式协商与体验优化

**Goal:** 让 `synapse negotiate` 成为真正的交互式协商工具，用户参与协定输入输出格式；精简命令体系，降低使用成本；更新文档站点和 Playground。

## CLI-INFRA — CLI 基础设施

- [ ] **CLI-INFRA-01**: 提取 negotiate 命令 — 将 `negotiate()` 从 `apps/cli/src/index.ts` 提取到 `apps/cli/src/commands/negotiate.ts`，遵循现有命令模式
- [ ] **CLI-INFRA-02**: 共享 prompt 工具 — 创建 `apps/cli/src/utils/prompts.ts`，封装 `@inquirer/prompts` 所有提示类型
- [ ] **CLI-INFRA-03**: TTY 检测 — 创建 `apps/cli/src/utils/tty.ts`，包含 `isInteractive()` 检查 stdin/stdout TTY + CI 环境变量 + `--no-interactive` 标志
- [ ] **CLI-INFRA-04**: 全局跳过标志 — 添加 `--yes`（跳过所有提示）、`--dry-run`（预览不保存）、`--no-save`（不保存 Lock）
- [ ] **CLI-INFRA-05**: 提取共享 pack 发现工具 — 将 `findPacksDir()`、`loadProviderCard()` 从 index.ts 提取到共享工具
- [ ] **CLI-INFRA-06**: 重构已有交互命令 — `setup.ts`、`connect.ts`、`billing.ts` 迁移到共享 prompts

## NEGO — 交互式协商

- [ ] **NEGO-01**: 交互式协商流程入口 — `synapse negotiate`（无 flags）启动交互式协商流程：选择 intent → 选择 provider → 审查 Schema → 确认
- [ ] **NEGO-02**: 输入输出 Schema 展示 — 格式化显示 Pack Feature 定义的输入输出字段，标明 required/optional
- [ ] **NEGO-03**: 字段自定义增减 — 用户可以对 optional 字段选择包含/排除，支持批量操作
- [ ] **NEGO-04**: LLM Key 发现与引导 — 协商前检查 vault/config/env 中是否有 LLM API Key，无 key 时引导配置
- [ ] **NEGO-05**: Stub 输出标记 — 当使用确定性 stub（无 LLM key）时，在输出中醒目提示用户这不是真正的协商
- [ ] **NEGO-06**: Lock diff 预览 — 保存前显示当前 Lock 与现有 Lock（如有）的差异
- [ ] **NEGO-07**: 协商后路由菜单 — 协商成功后提供菜单：测试 connect / 生成 SDK / 查看 @synapse-router/sdk 接入 / 退出
- [ ] **NEGO-08**: 非交互模式保持 — `--intent X --provider Y` 保留现有行为不变
- [ ] **NEGO-09**: SIGINT/SIGTERM 正确处理 — 中断时清理部分状态，不产生孤儿 Lock
- [ ] **NEGO-10**: 提示分级 — 每个提示分类为 required/recommended/contextual/confirmation，Enter 键接受默认值

## CMD — 命令精简

- [ ] **CMD-01**: Help 分组 — `--help` 输出按分类组织：Getting Started、Core Workflow、Provider Management、Configuration、Advanced
- [ ] **CMD-02**: 命令合并评估 — 评估 `provider`→`pack`、`smoke`→`connect`、`init`→`setup`、`profile`→`config`、`export/import`→`config` 等合并方案
- [ ] **CMD-03**: Help 文本共享 — 提取 help 文本到共享定义，与文档站点保持同步

## DOCS — 文档更新

- [ ] **DOCS-01**: 协商命令文档更新 — 更新 docs 中 `negotiate` 命令文档，覆盖交互式协商流程
- [ ] **DOCS-02**: 用户旅程文档 — 新增"用户旅程"文档，描述从安装到使用的完整流程
- [ ] **DOCS-03**: 命令参考更新 — 更新 CLI 命令参考，反映精简后的命令结构

## PLAY — Playground 更新

- [ ] **PLAY-06**: SDK 代码自动预览 — Playground 中 Schema 变化时自动预览生成的 SDK 代码
- [ ] **PLAY-07**: Schema 预设 — 内置 Chat、Text-to-Image、Embedding 预设 + localStorage 自定义预设
- [ ] **PLAY-08**: Billing 费用预览 — 在 Playground 中显示当前 Schema 的预估费用

## Future Requirements (Deferred)

- 协商记忆 (memo) 系统 (`~/.synapse/memos/`)
- Lock diff 工具 (`diffLocks()`)
- 多 Provider 并排对比
- 可视化的字段映射展示
- 协商历史 (`synapse negotiate --history`)
- Schema 模板库 (`~/.synapse/templates/`)
- "What if" 字段切换匹配预览

## Out of Scope

- 运行时 LLM 调用 — LLM 仅在开发时协商阶段使用
- 完整 TUI (Ink/React) — 终端保持文本提示，图形界面在 Playground
- 命令行拖拽字段映射 — 不适合 CLI 交互
- 跨会话协商状态持久化 — 协商是临时的，中断则重来

## Traceability

### v4.0

| REQ-ID | Phase | Status |
|--------|-------|--------|
| INFRA-01 | Phase 13 | Pending |
| INFRA-02 | Phase 13 | Pending |
| INFRA-03 | Phase 13 | Pending |
| DCOC-01 | Phase 14 | Pending |
| DCOC-02 | Phase 14 | Pending |
| PLAY-01 | Phase 15 | Pending |
| PLAY-02 | Phase 15 | Pending |
| PLAY-03 | Phase 15 | Pending |
| PLAY-04 | Phase 15 | Pending |
| PLAY-05 | Phase 15 | Pending |

### v5.0

| REQ-ID | Phase | Status |
|--------|-------|--------|
| CLI-INFRA-01 | Phase 17 | Pending |
| CLI-INFRA-02 | Phase 17 | Pending |
| CLI-INFRA-03 | Phase 17 | Pending |
| CLI-INFRA-04 | Phase 17 | Pending |
| CLI-INFRA-05 | Phase 17 | Pending |
| CLI-INFRA-06 | Phase 17 | Pending |
| NEGO-01 | Phase 18 | Pending |
| NEGO-02 | Phase 18 | Pending |
| NEGO-03 | Phase 18 | Pending |
| NEGO-04 | Phase 18 | Pending |
| NEGO-05 | Phase 18 | Pending |
| NEGO-06 | Phase 18 | Pending |
| NEGO-07 | Phase 18 | Pending |
| NEGO-08 | Phase 18 | Pending |
| NEGO-09 | Phase 18 | Pending |
| NEGO-10 | Phase 18 | Pending |
| CMD-01 | Phase 19 | Pending |
| CMD-02 | Phase 19 | Pending |
| CMD-03 | Phase 19 | Pending |
| DOCS-01 | Phase 20 | Pending |
| DOCS-02 | Phase 20 | Pending |
| DOCS-03 | Phase 20 | Pending |
| PLAY-06 | Phase 20 | Pending |
| PLAY-07 | Phase 20 | Pending |
| PLAY-08 | Phase 20 | Pending |
