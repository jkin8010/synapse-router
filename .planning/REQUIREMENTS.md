# Synapse Router — Requirements v2.1

## Milestone v2.1: Billing Integration

**Goal:** 将 `@synapse-router/billing` 模块集成到 Connector、SDK Generator 和 CLI，实现 API 调用计量计费、配额管理和降级策略。

---

## WRAPPER — Connector Wrapper 层

- [ ] **WRAPPER-01**: `createBillingConnector()` wrapper factory — 包裹 connector 的 pre-call（配额检查）和 post-call（用量记录），不修改 connector 内部代码
- [x] **WRAPPER-02**: `FileQuotaStorage` — 实现 `QuotaStorage` 接口，写入 `~/.synapse/quotas/<provider>.json`，原子写入（.tmp + rename），JSON 文件持久化配额状态
- [x] **WRAPPER-03**: Pricing bridge — pack `provider-card.json` 的 `{input, output, unit}` 格式 → billing `PricingRule` 映射函数，支持缺失字段的默认值填充
- [ ] **WRAPPER-04**: Graceful degradation — billing 错误（配置缺失/配额不足/写入失败）不阻塞 API 调用，默认 warn 而非 reject，可配置降级策略
- [ ] **WRAPPER-05**: Billing metadata — wrapper 返回结果包含调用次数、剩余配额、预估费用等元数据，作为 `BillingResult` 附加在 connector response 上

## SDKBILL — SDK Billing 生成

- [ ] **SDKBILL-01**: `--with-billing` SDK 生成标志 — sdk-generator 支持输出 billing 辅助代码
- [ ] **SDKBILL-02**: `BillingTracker` 类模板 — standalone 零依赖的计费追踪类，内联定价常量（不 import `@synapse-router/*`）
- [ ] **SDKBILL-03**: TS/JS SDK 生成时 companion 目录包含 billing tracker 输出（`.synapse/billing/`）

## CLIBILL — CLI Billing 命令

- [ ] **CLIBILL-01**: `synapse billing init` — 项目 billing 配置初始化（选择计价策略、设置配额限制）
- [ ] **CLIBILL-02**: `synapse billing config` — 查看/设置 billing 配置（`synapse config set billing.*` 扩展）
- [ ] **CLIBILL-03**: `synapse billing status` — 查看配额状态（剩余调用次数、重置时间、预估费用）
- [ ] **CLIBILL-04**: `synapse connect` 自动读取 billing 配置并包裹 connector

---

## Future Requirements (Deferred)

- Python SDK billing 支持
- Redis/DB 配额存储后端
- Registry-hosted pricing 自动同步
- Streaming cost estimation
- Provider packs pricing 数据补充（留在研究阶段，无需此 milestone 完成）

## Out of Scope

- Connector 内部添加 billing hook — wrapper 模式是强制约束
- 生成的 SDK 代码中 import billing 包 — 使用 companion 文件模式
- 运行时计费服务 — billing 是开发时和 CLI 层关注，非运行时服务
- 支付集成 — 仅计量和配额管理，不做真正的扣费/支付

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| WRAPPER-01 | Phase 8 | pending |
| WRAPPER-02 | Phase 8 | Complete |
| WRAPPER-03 | Phase 8 | Complete |
| WRAPPER-04 | Phase 8 | pending |
| WRAPPER-05 | Phase 8 | pending |
| SDKBILL-01 | Phase 9 | pending |
| SDKBILL-02 | Phase 9 | pending |
| SDKBILL-03 | Phase 9 | pending |
| CLIBILL-01 | Phase 10 | pending |
| CLIBILL-02 | Phase 10 | pending |
| CLIBILL-03 | Phase 10 | pending |
| CLIBILL-04 | Phase 10 | pending |
