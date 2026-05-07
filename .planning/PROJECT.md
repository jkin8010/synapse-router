# Synapse Router — Project

## What This Is

面向 AI Agent 的受控 Schema 协商与多 Provider 路由层。位于 AI Agent 与多 Provider API 之间，确保每次请求在执行前都有明确契约。

v1.0 实现了完整的契约验证闭环：Schema 协商 → Manifest 匹配 → SDK 代码生成 → Mock 测试 → Registry 异步提交。

## Core Value

**"先有契约，再调用"** — 每次路由都从 Schema 契约开始，只有契约明确后才允许调用 Provider。v1.0 通过 `negotiateAndVerify` 全链路验证将协商成功率从单次 LLM 调用提升到重试验证闭环。

## Requirements

### Validated

- ✅ 零依赖 HTTP Mock Server (node:http) — v1.0 (18 tests passing)
- ✅ Schema 字段级 Manifest 约束匹配 (missing/extra/type_mismatch) — v1.0 (21 tests passing)
- ✅ negotiateAndVerify 全链路 pipeline 编排 — v1.0 (38 negotiator tests passing)
- ✅ retryWithFeedback 结构化重试 (MAX_RETRIES=2) — v1.0
- ✅ Fire-and-forget Registry 异步验证提交 — v1.0
- ✅ 多 Provider Pack 支持 (openai, replicate, stability, comfyui) — v1.0
- ✅ TypeScript/Python SDK 自动生成 — v1.0 (24 tests passing)
- ✅ CLI 工具链 (connect/setup/config/vault/lock/sdk/pack) — v1.0

### Active

- [ ] 真实 Provider 冒烟测试
- [ ] API 认证中间件
- [ ] Web UI/Playground 可视化界面
- [ ] E2E 端到端测试
- [ ] SDK 缓存优化
- [ ] Registry `contract_verifications` 表和 API

### Out of Scope

- 多租户支持 — 个人/小团队优先
- 计费系统 — billing 包待后续 Phase

## Context

Shipped v1.0 with ~25,750 LOC TypeScript across 14 packages + 4 apps.
Tech stack: TypeScript 5.9+ strict, Node.js 22+, pnpm 10+ monorepo.
14 packages: core, negotiator, providers, router, connector, lock, vault, pack-generator, sdk-generator, sdk, billing, observability, contract-mocker, registry-client.
4 apps: cli, api, mcp-server, playground, comfy-node.
~430 tests passing across all packages.

## Key Decisions

| Decision | Outcome |
|----------|---------|
| node:http 零依赖 Mock Server | ✅ Good — fast startup, no dependency conflicts |
| DSL constraints JSON Schema 子集 | ✅ Good — sufficient for field-level matching |
| MAX_RETRIES=2 硬编码 | ✅ Good — prevents infinite loops, 2 retries sufficient |
| Registry fire-and-forget | ✅ Good — pipeline never blocked by Registry unavailability |
| 动态 import 解决 verifier↔retry 循环依赖 | ⚠️ Revisit — pragmatic for now, refactor to event-driven later |

## Constraints

- Connector 只能做 HTTP 请求 + 字段映射 + base_url 覆盖
- Schema Lock 不可变，类似 package-lock.json
- 生成的 SDK 零依赖 @synapse-router/*
- Vault 永不明文落盘
- Registry 是可选增强，不可用时不影响核心功能

---
*Last updated: 2026-05-07 after v1.0 milestone*
