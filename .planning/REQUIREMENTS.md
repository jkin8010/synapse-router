# Synapse Router -- Requirements v2.1 & v3.0

## Milestone v2.1: Billing Integration

**Goal:** 将 `@synapse-router/billing` 模块集成到 Connector、SDK Generator 和 CLI，实现 API 调用计量计费、配额管理和降级策略。

---

## WRAPPER -- Connector Wrapper 层

- [x] **WRAPPER-01**: `createBillingConnector()` wrapper factory -- 包裹 connector 的 pre-call（配额检查）和 post-call（用量记录），不修改 connector 内部代码
- [x] **WRAPPER-02**: `FileQuotaStorage` -- 实现 `QuotaStorage` 接口，写入 `~/.synapse/quotas/<provider>.json`，原子写入（.tmp + rename），JSON 文件持久化配额状态
- [x] **WRAPPER-03**: Pricing bridge -- pack `provider-card.json` 的 `{input, output, unit}` 格式 → billing `PricingRule` 映射函数，支持缺失字段的默认值填充
- [x] **WRAPPER-04**: Graceful degradation -- billing 错误（配置缺失/配额不足/写入失败）不阻塞 API 调用，默认 warn 而非 reject，可配置降级策略
- [x] **WRAPPER-05**: Billing metadata -- wrapper 返回结果包含调用次数、剩余配额、预估费用等元数据，作为 `BillingResult` 附加在 connector response 上

## SDKBILL -- SDK Billing 生成

- [ ] **SDKBILL-01**: `--with-billing` SDK 生成标志 -- sdk-generator 支持输出 billing 辅助代码
- [ ] **SDKBILL-02**: `BillingTracker` 类模板 -- standalone 零依赖的计费追踪类，内联定价常量（不 import `@synapse-router/*`）
- [ ] **SDKBILL-03**: TS/JS SDK 生成时 companion 目录包含 billing tracker 输出（`.synapse/billing/`）

## CLIBILL -- CLI Billing 命令

- [x] **CLIBILL-01**: `synapse billing init` -- 项目 billing 配置初始化（选择计价策略、设置配额限制）
- [x] **CLIBILL-02**: `synapse billing config` -- 查看/设置 billing 配置（`synapse config set billing.*` 扩展）
- [x] **CLIBILL-03**: `synapse billing status` -- 查看配额状态（剩余调用次数、重置时间、预估费用）
- [x] **CLIBILL-04**: `synapse connect` 自动读取 billing 配置并包裹 connector

---

## Future Requirements (Deferred)

- Python SDK billing 支持
- Redis/DB 配额存储后端
- Registry-hosted pricing 自动同步
- Streaming cost estimation
- Provider packs pricing 数据补充（留在研究阶段，无需此 milestone 完成）

## Out of Scope

- Connector 内部添加 billing hook -- wrapper 模式是强制约束
- 生成的 SDK 代码中 import billing 包 -- 使用 companion 文件模式
- 运行时计费服务 -- billing 是开发时和 CLI 层关注，非运行时服务
- 支付集成 -- 仅计量和配额管理，不做真正的扣费/支付

---

# Synapse Router -- Requirements v3.0

## Milestone v3.0: AI Agent Skill Distribution

**Goal:** 为 Synapse Router 创建可分发的 AI Agent Skill，支持多通道安装（npm/skills add/GitHub URL），兼容主流 AI Agent 平台

---

## SKILLPKG -- Skill 包结构

- [ ] **SKILLPKG-01**: `@synapse-router/skill` npm 包 -- 标准的 Skill 发布包，包含所有平台格式
- [ ] **SKILLPKG-02**: 包目录结构 -- `skills/` 下每个 AI Agent 平台一个子目录（claude-code/, cursor/, codex/, openclaw/, hermes/）
- [ ] **SKILLPKG-03**: Claude Code Skill 格式 -- skill.md 包含 CLI 命令、API 使用和架构指南
- [ ] **SKILLPKG-04**: Cursor Rules 格式 -- .cursorrules 包含项目上下文和 AI 指导
- [ ] **SKILLPKG-05**: Codex / OpenClaw / Hermes 格式 -- 对应平台 agent 配置文件

## SKILLINSTALL -- Install 安装 CLI

- [ ] **SKILLINSTALL-01**: `npx @synapse-router/install-skill` CLI -- 一键安装脚手架
- [ ] **SKILLINSTALL-02**: 环境自动检测 -- 检测当前 AI Agent 环境并安装到正确位置
- [ ] **SKILLINSTALL-03**: 手动指定 -- `--platform` 和 `--dir` 标志覆盖自动检测
- [ ] **SKILLINSTALL-04**: 安装确认和回滚 -- `--dry-run` 预览，`--uninstall` 卸载

## SKILLGIT -- GitHub 分销

- [x] **SKILLGIT-01**: GitHub raw URL 安装支持 -- `skills add https://raw.githubusercontent.com/...` 直接安装
- [x] **SKILLGIT-02**: Repo root skill 入口 -- 项目根目录提供 skill.md 入口文件
- [ ] **SKILLGIT-03**: CI/CD 自动化 -- GitHub Actions 自动发布 skill 包到 npm

## SKILLCOVER -- Skill 内容覆盖

- [x] **SKILLCOVER-01**: CLI 命令文档 -- 覆盖所有 synapse 子命令
- [x] **SKILLCOVER-02**: Schema 协商模式 -- Provider Pack Schema、Intent 匹配、SDK 生成
- [x] **SKILLCOVER-03**: Provider 路由 -- Router 配置和策略选择指南
- [x] **SKILLCOVER-04**: Billing 集成 -- billing init/config/status 使用指南
- [x] **SKILLCOVER-05**: 架构原则 -- "开发时协商，运行时无感" 核心约束

---

## Future Requirements (Deferred)

- 多语言 skill 支持（英文/中文）
- GUI skill 管理界面
- Skill 版本更新检测和自动更新
- Marketplace/Registry 集成

## Out of Scope for v3.0

- Provider packs pricing 数据补充（延续 v2.1）
- Python billing 支持
- 运行时 LLM 调用

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| WRAPPER-01 | Phase 8 | Complete |
| WRAPPER-02 | Phase 8 | Complete |
| WRAPPER-03 | Phase 8 | Complete |
| WRAPPER-04 | Phase 8 | Complete |
| WRAPPER-05 | Phase 8 | Complete |
| SDKBILL-01 | Phase 9 | Complete |
| SDKBILL-02 | Phase 9 | Complete |
| SDKBILL-03 | Phase 9 | Complete |
| CLIBILL-01 | Phase 10 | Complete |
| CLIBILL-02 | Phase 10 | Complete |
| CLIBILL-03 | Phase 10 | Complete |
| CLIBILL-04 | Phase 10 | Complete |
| SKILLPKG-01 | Phase 11 | Complete |
| SKILLPKG-02 | Phase 11 | Complete |
| SKILLPKG-03 | Phase 11 | Complete |
| SKILLPKG-04 | Phase 11 | Complete |
| SKILLPKG-05 | Phase 11 | Complete |
| SKILLINSTALL-01 | Phase 12 | pending |
| SKILLINSTALL-02 | Phase 12 | pending |
| SKILLINSTALL-03 | Phase 12 | pending |
| SKILLINSTALL-04 | Phase 12 | pending |
| SKILLGIT-01 | Phase 11 | Complete |
| SKILLGIT-02 | Phase 11 | Complete |
| SKILLGIT-03 | Phase 12 | pending |
| SKILLCOVER-01 | Phase 11 | Complete |
| SKILLCOVER-02 | Phase 11 | Complete |
| SKILLCOVER-03 | Phase 11 | Complete |
| SKILLCOVER-04 | Phase 11 | Complete |
| SKILLCOVER-05 | Phase 11 | Complete |
