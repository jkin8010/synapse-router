# Synapse Router — 路线图

## Phase 1: Negotiator 可靠性增强

**Status:** `计划中`
**Goal:** "一次协商，一次运行" — 在现有 negotiator → sdk-generator 流水线中增加契约验证闭环。

### 关键决策 (D-01 ~ D-16)
- Contract Mocker: `node:http` 进程内 HTTP Mock Server，零外部依赖
- Provider Manifest: DSL 文件轻量扩展 `features[].constraints` 字段
- Pipeline: 统一 `negotiateAndVerify()` 入口，全链路验证（静态 manifest 匹配 → 代码生成 → 动态 mock 测试）
- 重试: 最多 2 次，结构化错误注入 LLM prompt
- Registry: 异步提交验证结果，本地优先

### 计划
| Plan | Objective | Wave | 决策 | 状态 |
|------|-----------|------|------|------|
| 01-01-PLAN.md | Contract Mocker 包 | 1 | D-01~D-04 | ✅ |
| 01-02-PLAN.md | Manifest 类型与匹配 | 1 | D-05, D-07, D-13 (types) | ⬜ |
| 01-03-PLAN.md | Pipeline + 重试逻辑 | 2 | D-08~D-13 (impl) | ⬜ |
| 01-04-PLAN.md | Registry 集成 | 2 | D-14~D-16 | ⬜ |

### 延迟项
- Registry 侧 `contract_verifications` 表和 API → synapse-registry Phase 2
- 真实 Provider 冒烟测试 → 后续 Phase
- SDK 缓存优化 → 后续 Phase
