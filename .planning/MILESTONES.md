# Milestones

## v1.0 Negotiator Reliability (Shipped: 2026-05-07)

**Phases completed:** 1 phase, 4 plans, 11 tasks

**Key accomplishments:**

- 零外部依赖的进程内 HTTP Mock Server，Schema 驱动的假数据生成，请求体字段验证
- ManifestConstraint 约束定义 + `matchManifest` 三种差异检测 (missing/extra/type_mismatch)
- `negotiateAndVerify()` 全链路 pipeline 编排 + `retryWithFeedback` 最多 2 次结构化重试
- Fire-and-forget Registry 验证提交 + `~/.synapse/verifications/` 本地缓存 + Remote manifest 增强加载

**Known deferred items at close:** 5 (see ROADMAP.md 延迟项)

---
