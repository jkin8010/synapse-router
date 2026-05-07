# Synapse Router — 路线图

## Milestones

- ✅ **v1.0 Negotiator Reliability** — Phase 1 (shipped 2026-05-07)

## Phases

<details>
<summary>✅ v1.0 Negotiator Reliability (Phase 1) — SHIPPED 2026-05-07</summary>

- [x] Phase 1: Negotiator 可靠性增强 (4/4 plans) — completed 2026-05-07
  - 01-01: Contract Mocker 包 — 零依赖 HTTP Mock Server
  - 01-02: Manifest 类型与匹配 — 约束定义 + 三种差异检测
  - 01-03: Pipeline + 重试逻辑 — negotiateAndVerify 全链路编排
  - 01-04: Registry 集成 — Fire-and-forget 异步验证提交

</details>

## 延迟项

- Registry 侧 `contract_verifications` 表和 API → synapse-registry Phase 2
- 真实 Provider 冒烟测试 → 后续 Phase
- SDK 缓存优化 → 后续 Phase
- API 认证中间件 → 后续 Phase
- Web UI/Playground → 后续 Phase
- E2E 测试 → 后续 Phase

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
| ----- | --------- | -------------- | ------ | --------- |
| 1. Negotiator 可靠性增强 | v1.0 | 4/4 | Complete | 2026-05-07 |
