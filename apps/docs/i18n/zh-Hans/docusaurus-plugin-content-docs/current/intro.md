---
sidebar_position: 1
title: Overview & Getting Started
---

# Synapse Router 概览与快速开始 (Overview & Getting Started)

Synapse Router 是一个面向 AI Agent 的受控 Schema 协商（Schema Negotiation）与多 Provider 路由层（Multi-Provider Router）。它位于 AI Agent 与多 Provider API 之间，确保每次请求在执行前都有明确契约（Contract）。Router 不是运行时中间件，而是开发时 SDK 生成引擎（SDK Generation Engine）。

## 快速开始 (Getting Started)

### 1. 安装 (Installation)

**前置要求：** Node.js 22+

全局安装 Synapse CLI：

```bash
npm install -g @synapse-router/cli
```

或者使用 pnpm：

```bash
pnpm add -g @synapse-router/cli
```

安装完成后，验证版本：

```bash
synapse --version
```

### 2. 配置 Provider (Provider Configuration)

配置 Provider 有两种方式：交互式向导或手动配置。

**交互式方式：** 运行 `synapse setup`，按照提示选择 Provider、输入 API Key 并完成基础配置。

```bash
synapse setup
```

**手动方式：** 使用 `synapse vault set` 命令直接存储 API Key 并指定 API 地址。

```bash
synapse vault set deepseek sk-xxx --base-url https://api.deepseek.com/v1
synapse vault set openai sk-proj-xxx --base-url https://api.openai.com/v1
```

API Key 使用 AES-256-GCM 加密存储，永不明文落盘。所有日志输出自动脱敏，确保 Key 不会出现在 Trace 或 Span 中。

### 3. 首次连接 (First Connect)

配置完成后，使用 `synapse connect` 命令连接 Provider 并执行一个功能：

```bash
synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"你好，请介绍一下你自己"}]}'
```

预期输出（以下为示例，实际内容因 Provider 而异）：

```json
{
  "output": {
    "model": "deepseek-chat",
    "choices": [{"message": {"role": "assistant", "content": "..."}}],
    "usage": {"total_tokens": 50}
  }
}
```

如果已配置计费（Billing）策略，可以添加 `--billing` 参数自动包裹用量追踪：

```bash
synapse connect deepseek chat --input '{"messages":[]}' --billing preCall
```

### 4. 生成 SDK (Generate SDK)

连接验证成功后，下一步是使用 `synapse sdk generate` 生成零依赖 SDK。此命令将 Schema 协商结果转换为纯函数 SDK 代码，应用代码中不再需要 Router，只引用生成的 SDK。

```bash
synapse sdk generate --pack openai --lang typescript --output ./synapse-sdk
```

如需包含用量追踪能力：

```bash
synapse sdk generate --pack openai --lang typescript --output ./synapse-sdk --with-billing
```

详细的使用说明请参考 [SDK Guide](/docs/sdk)。

## 核心定位 (Core Position)

Router 不是运行时中间件，而是**开发时 SDK 生成引擎**。应用代码里没有 Router，只有生成的 SDK。所有协商、路由决策、Provider 选择在开发时完成，运行时只有纯代码 SDK。

**开发时协商，运行时无感** — 协商阶段可以复杂、可以调用 LLM、可以探索，因为它是离线的、一次性的。运行时只有纯代码逻辑的 SDK，确定性（Deterministic）、零 Token 成本（Zero Token Cost）、零 LLM 意外。

## 架构概览 (Architecture Overview)

整个系统的工作流程分为三个阶段：

1. **Schema 协商（Schema Negotiation）** — Intent 匹配 + 能力验证 + 字段级 Manifest 约束检查。协商引擎将 Agent 的意图匹配到 Provider 的 Feature，生成 Schema 契约（Contract）。
2. **Provider 路由（Provider Routing）** — 多维评分路由引擎根据策略（cheap/fast/quality/balanced/cost-capped）对候选 Provider 进行评分、过滤、排序，选择最优 Provider。
3. **SDK 生成（SDK Generation）** — 通过 `synapse sdk generate` 将 Schema Lock 转换为纯函数 SDK 代码（TypeScript / Python），零外部依赖。

Synapse CLI 提供了上述所有能力的统一入口。详细命令说明见 [CLI Reference](/docs/cli)。

## 下一步 (Next Steps)

- [/docs/cli](/docs/cli) — 所有命令的完整参考（complete command reference）
- [/docs/sdk](/docs/sdk) — SDK 生成与使用详解（SDK generation and usage）
- [/docs/api](/docs/api) — REST API 接口文档（REST API documentation）
- [/docs/packs](/docs/packs) — Provider Pack 开发指南（Provider Pack development guide）
