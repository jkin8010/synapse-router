# Synapse Router — Project

## What This Is

面向 AI Agent 开发者的 **Schema 协商与 SDK 生成引擎**。Router 不是运行时中间件，而是一个**开发时工具**：

1. **协商**：读取 Registry Provider Pack + `.synapse/` 运行时数据，生成 Schema 契约
2. **生成**：输出纯代码的 SDK（TypeScript / Python），零运行时依赖
3. **演化**：基于产线日志 + Provider API 变化，在下一轮迭代中自适应更新 SDK

应用代码里**没有 Router**，只有生成的 SDK。

## Core Value

**"开发时协商，运行时无感"** — 协商阶段可以复杂、可以调用 LLM、可以探索，因为它是离线的、一次性的。运行时只有纯代码逻辑的 SDK，确定性、零 Token 成本、零 LLM 意外。

## Current Milestone: v3.0 AI Agent Skill Distribution

**Goal:** 为 Synapse Router 创建可分发的 AI Agent Skill，支持多通道安装（npm/skills add/GitHub URL），兼容主流 AI Agent 平台

**Target features:**
- `@synapse-router/skill` npm 包 — 标准的 Skill 包（含多平台格式）
- `npx @synapse-router/install-skill` — 一键安装 CLI 工具
- GitHub raw URL 安装支持
- 兼容多 AI Agent 平台格式（Claude Code Skill, Cursor Rules, Codex Agent 等）
- 自动检测当前 AI Agent 环境并安装到正确位置

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
- ✅ FileQuotaStorage 原子文件持久化 (SYNAPSE_QUOTA_DIR, .tmp+rename) — v2.1 (Phase 8)
- ✅ pricingFromProviderCard 纯函数桥接 — v2.1 (Phase 8)
- ✅ createBillingConnector wrapper 工厂 (preCall/postCall 编排) — v2.1 (Phase 8)
- ✅ BillingTracker SDK generation with --with-billing flag — v2.1 (Phase 9)
- ✅ Zero-dependency BillingTracker companion class at .synapse/billing/tracker.ts — v2.1 (Phase 9)
- ✅ billing init/config/status CLI 命令 (billing.ts, ~1019 lines) — v2.1 (Phase 10)
- ✅ connect 自动 wrap billing (createBillingConnector) — v2.1 (Phase 10)
- ✅ config set billing.* 点号记法访问 billing-config.json — v2.1 (Phase 10)
- ✅ @synapse-router/skill npm 包 scaffold (package.json/tsconfig.json/src/index.ts) — v3.0 (Phase 11)
- ✅ CLAUDE.md 增强为通用主入口 (CLI 参考/Schema 协商/Provider 路由/Billing 集成/架构原则) — v3.0 (Phase 11)
- ✅ Claude Code skill.md + Cursor .cursorrules 平台配置 — v3.0 (Phase 11)
- ✅ Codex agent.yaml + OpenClaw/Hermes agent.md 平台配置 — v3.0 (Phase 11)
- ✅ skill.md GitHub raw URL 安装入口 — v3.0 (Phase 11)

### Active

- [ ] 真实 Provider 冒烟测试 — v1.1 (Phase 4)
- [ ] Web UI/Playground 可视化界面 — v1.1 (Phase 3)
- [ ] E2E 端到端测试框架和关键路径 — v1.1 (Phase 2)
- [ ] API 认证中间件
- [ ] SDK 缓存优化
- [ ] Registry `contract_verifications` 表和 API
- [ ] `synapse evolve` 命令 — v1.2
- [ ] 统一 Provider Pack 加载 — v1.2
- [ ] `.synapse/` 运行时日志系统 — v2.0
- [ ] `synapse watchdog` — v2.0
- [ ] `synapse export` / `synapse import` — v2.0
- [ ] Provider Profile 数据聚合 — v2.0
- [ ] 协商记忆 (markdown) 系统 — v2.0
- [ ] `synapse evolve` 规则更新 — v2.0
- [ ] Registry Intelligence API 集成 — v2.0
- [ ] 匿名遥测 (opt-in) — v2.0
- [ ] Change-detector协作 — v2.0

### Out of Scope

- 运行时路由器 — Router 不参与运行时路径
- 运行时 LLM 调用 — 运行时路径无 LLM
- 运行时 Epsilon-Greedy 探索 — 探索只在开发时发生

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
| Router ≠ 运行时中间件 | Router 是开发时工具，输出 SDK |
| 运行时 = 纯 SDK | 无 LLM、无随机、无网络外依赖 |
| .synapse/ 通过 Git 同步 | Git 天然适合文本/md/json，零新基础设施 |
| Watchdog 为独立进程 | SDK 保持极薄（一行 write），watchdog 可独立部署/配置 |

## Constraints

- SDK 零依赖 @synapse-router/*
- Vault 永不明文落盘
- Registry 是可选增强，离线时协商仍可基于本地 Pack 工作
- 运行时路径无 LLM 调用
- SDK 不包含 watchdog 逻辑

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-19 — v2.1 Billing complete, v3.0 AI Agent Skill Distribution (Phase 11: content coverage complete)*
