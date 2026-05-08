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

- [x] **SMOKE-01**: 冒烟测试框架（真实 API key 输入、超时控制、skip 标记）
- [x] **SMOKE-02**: OpenAI chat completions 冒烟测试
- [x] **SMOKE-03**: Replicate 冒烟测试
- [x] **SMOKE-04**: 冒烟测试 CLI 命令（synapse smoke --provider openai）

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
| SMOKE-01 | Phase 4 | Complete |
| SMOKE-02 | Phase 4 | Complete |
| SMOKE-03 | Phase 4 | Complete |
| SMOKE-04 | Phase 4 | Complete |
