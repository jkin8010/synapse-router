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

## Traceability

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
