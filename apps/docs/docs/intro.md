---
sidebar_position: 1
title: Overview
---

# Synapse Router Overview

Synapse Router 是一个面向 AI Agent 的受控 Schema 协商与多 Provider 路由层。它位于 AI Agent 与多 Provider API 之间，确保每次请求在执行前都有明确契约。

## 核心定位

Router 不是运行时中间件，而是**开发时 SDK 生成引擎**。应用代码里没有 Router，只有生成的 SDK。所有协商、路由决策、Provider 选择在开发时完成，运行时只有纯代码 SDK。

## 核心理念

**开发时协商，运行时无感** — 协商阶段可以复杂、可以调用 LLM、可以探索，因为它是离线的、一次性的。运行时只有纯代码逻辑的 SDK，确定性、零 Token 成本、零 LLM 意外。

## 架构概览

整个系统的工作流程分为三个阶段：

1. **Schema 协商** — Intent 匹配 + 能力验证 + 字段级 Manifest 约束检查。协商引擎将 Agent 的意图匹配到 Provider 的 Feature，生成 Schema 契约。

2. **Provider 路由** — 多维评分路由引擎根据策略（cheap/fast/quality/balanced/cost-capped）对候选 Provider 进行评分、过滤、排序，选择最优 Provider。

3. **SDK 生成** — 通过 `synapse evolve` 将 Schema Lock 转换为纯函数 SDK 代码（TypeScript / Python），零外部依赖。

## 下一步

- 查看 [CLI Reference](/docs/cli) 了解所有命令的详细用法
- 查看 [SDK Guide](/docs/sdk) 了解如何生成和使用 SDK
