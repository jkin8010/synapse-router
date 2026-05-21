---
sidebar_position: 3
title: SDK Guide
---

# SDK Guide

`synapse evolve` 是 SDK 生成的入口，它将 Schema Lock 转换为纯函数 SDK 代码。

## 流程概览

1. **读取 Provider Pack** — 从 `packs/`、Registry 和本地目录加载所有 Provider Pack
2. **协商 Schema Lock** — 对每个 Provider 的 Feature 执行协商，创建 Schema Lock
3. **生成代码** — 根据 Lock 中的字段映射生成 TypeScript / Python SDK 代码
4. **输出** — 写入 `--output` 目录（默认 `./synapse-sdk`），零外部依赖

## 使用方法

```bash
# 基础生成
synapse evolve

# 生成带有 Billing 追踪的 SDK
synapse evolve --with-billing

# 指定输出目录并重新协商
synapse evolve --output ./my-sdk --tune
```

## SDK 特性

- **零依赖** — 生成的 SDK 不依赖 `@synapse-router/*`，只使用内置 `fetch`
- **TypeScript & Python** — 支持两种语言
- **Billing 追踪（可选）** — `--with-billing` 标志包含 `BillingTracker` 类
- **确定性** — 相同输入始终得到相同输出

> 详细 SDK 用法说明将在后续版本中完善。
