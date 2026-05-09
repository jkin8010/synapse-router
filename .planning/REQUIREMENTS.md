# Synapse Router — Requirements v1.1

## Milestone v1.1: Testing & Playground

**Goal:** 建立完整的端到端测试覆盖和可视化调试界面，确保全链路可验证、可观测。

---

## E2E — 端到端测试

- [ ] **E2E-01**: 建立 E2E 测试框架基础设施（测试运行器、fixture 管理、断言工具）
- [ ] **E2E-02**: CLI `connect` 命令端到端测试（synapse connect --task "..." 全流程）
- [ ] **E2E-03**: API `/negotiate` 端点端到端测试（HTTP request → response 验证）
- [ ] **E2E-04**: MCP Server negotiate tool 端到端测试
- [ ] **E2E-05**: `negotiateAndVerify` 全链路测试（negotiate → manifest match → SDK gen → mock test）
- [ ] **E2E-06**: SDK 生成后代码可编译/可执行验证

## PLAYGROUND — Web 可视化调试

- [ ] **PLAYGROUND-01**: Playground 基础 UI 框架（React/Vite，左右分栏布局）
- [ ] **PLAYGROUND-02**: Schema 编辑器面板（JSON 编辑、语法高亮、格式化）
- [ ] **PLAYGROUND-03**: Provider 选择器（列出已安装 packs，选择 provider/base_url）
- [ ] **PLAYGROUND-04**: 实时请求/响应查看（发送 negotiate 请求、展示返回的 schema + SDK 代码）
- [ ] **PLAYGROUND-05**: Mock 测试面板（对返回 schema 运行 mock 测试，展示结果）

## SMOKE — Provider 冒烟测试

- [ ] **SMOKE-01**: 冒烟测试框架（真实 API key 输入、超时控制、skip 标记）
- [ ] **SMOKE-02**: OpenAI chat completions 冒烟测试
- [ ] **SMOKE-03**: Replicate 冒烟测试
- [ ] **SMOKE-04**: 冒烟测试 CLI 命令（synapse smoke --provider openai）

---

## Milestone v1.2: Router Integration

**Goal:** Router 从 CLI 工具进化为 SDK 生成引擎。`synapse evolve` 为核心命令，输出纯代码 SDK。

---

## GEN — SDK 生成引擎

- [ ] **GEN-01**: `synapse evolve` 基础命令（读取 provider packs → 协商 → 输出 SDK 到指定目录）
- [ ] **GEN-02**: SDK 生成增强（环境配置入口、错误处理、重试逻辑、`.synapse/` 日志钩子）
- [ ] **GEN-03**: `synapse init` 项目初始化（生成 SDK 集成模板和 CI/CD 配置）

---

## Milestone v2.0: Offline Evolution

**Goal:** 建立开发时协商 → 运行时纯 SDK → 产线日志 → Git 同步 → 下一轮演化的完整闭环。

---

## EVOLVE — 本地演化引擎

- [ ] **EVOLVE-01**: `.synapse/` 运行时日志系统（SDK 一行 JSON append 到 events.ndjson，Profile 聚合）
- [ ] **EVOLVE-02**: `synapse watchdog` 规则引擎（纯代码规则匹配，致命/关键错误自动 gh issue create）
- [ ] **EVOLVE-03**: `synapse export`/`import` + `.synapse/` Git 集成（产线 → 开发数据同步）
- [ ] **EVOLVE-04**: `synapse evolve` 完整闭环（读 .synapse/ → 读 Provider Packs → 协商 → 生成 SDK）

## COEVOLVE — 双端协同进化

- [ ] **COEVOLVE-01**: Registry 变更通知 → `synapse evolve` 触发链路
- [ ] **COEVOLVE-02**: `synapse evolve` registry 数据源集成（拉取最新 pack，对比本地版本）
- [ ] **COEVOLVE-03**: SDK 版本通知（CI/CD 集成：检测新 SDK 可用 → 自动 PR）

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| E2E-01 | Phase 2 | pending |
| E2E-02 | Phase 2 | pending |
| E2E-03 | Phase 2 | pending |
| E2E-04 | Phase 2 | pending |
| E2E-05 | Phase 2 | pending |
| E2E-06 | Phase 2 | pending |
| PLAYGROUND-01 | Phase 3 | pending |
| PLAYGROUND-02 | Phase 3 | pending |
| PLAYGROUND-03 | Phase 3 | pending |
| PLAYGROUND-04 | Phase 3 | pending |
| PLAYGROUND-05 | Phase 3 | pending |
| SMOKE-01 | Phase 4 | pending |
| SMOKE-02 | Phase 4 | pending |
| SMOKE-03 | Phase 4 | pending |
| SMOKE-04 | Phase 4 | pending |
| GEN-01 | Phase 5 | pending |
| GEN-02 | Phase 5 | pending |
| GEN-03 | Phase 5 | pending |
| EVOLVE-01 | Phase 6 | pending |
| EVOLVE-02 | Phase 6 | pending |
| EVOLVE-03 | Phase 6 | pending |
| EVOLVE-04 | Phase 6 | pending |
| COEVOLVE-01 | Phase 7 | pending |
| COEVOLVE-02 | Phase 7 | pending |
| COEVOLVE-03 | Phase 7 | pending |
