---
sidebar_position: 3
title: SDK Guide
---

# SDK 使用指南 (SDK Guide)

Synapse Router 通过 `synapse evolve` 命令将 Schema 协商（Schema Negotiation）结果转换为零依赖（Zero-Dependency）的纯函数 SDK 代码。生成的 SDK 不依赖任何 `@synapse-router/*` 包，只使用内置 `fetch`，可在任何 JavaScript/TypeScript 环境中运行。

## evolve 工作流程 (Evolve Workflow)

evolve 命令的处理流程包含四个步骤：

1. **读取 Provider Pack（Load Provider Pack）** — 从 `packs/`、Registry 和本地目录加载所有 Provider Pack
2. **协商 Schema Lock（Negotiate Schema Lock）** — 对每个 Provider 的 Feature 执行协商，创建冻结的 Schema Lock（类似 `package-lock.json`）
3. **生成代码（Generate Code）** — 根据 Lock 中的字段映射（Field Mappings）生成 TypeScript / Python SDK 代码
4. **输出（Output）** — 写入 `--output` 目录（默认 `./synapse-sdk`），零外部依赖

## 命令参数 (Command Parameters)

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--output <dir>` | string | 否 | `./synapse-sdk` | SDK 输出目录 |
| `--tune` | flag | 否 | false | 重新协商所有 Schema Lock（Re-negotiate all locks） |
| `--with-billing` | flag | 否 | false | 在生成的 SDK 中包含 BillingTracker 用量追踪类 |

## 使用示例 (Usage Examples)

### Example 1 — 基础生成 (Basic Generation)

```bash
synapse evolve
```

执行后会在当前目录下生成 `./synapse-sdk/` 目录，包含 TypeScript SDK 代码，可直接在项目中引用。

### Example 2 — 包含 Billing 追踪 (With Billing Tracking)

```bash
synapse evolve --with-billing
```

生成的 SDK 中包含 `BillingTracker` 类，自动追踪每次 API 调用的用量。适用于需要计费和配额管理的生产环境。

### Example 3 — 自定义输出目录并重新协商 (Custom Output + Re-negotiate)

```bash
synapse evolve --output ./my-sdk --tune
```

输出到自定义目录 `./my-sdk`，并强制重新协商所有 Schema Lock。此功能在更新 Provider Pack 后特别有用，确保 SDK 反映最新的 Provider 能力。

## 生成的 SDK 结构 (Generated SDK Structure)

```text
synapse-sdk/
├── index.ts          # Main entry point, exports all functions
├── types.ts          # TypeScript type definitions
├── providers/        # Per-provider function files
│   ├── deepseek.ts
│   └── openai.ts
└── billing.ts        # BillingTracker (only with --with-billing)
```

- **index.ts** — 主入口文件，导出所有 SDK 函数
- **types.ts** — TypeScript 类型定义，包含输入输出参数的完整类型声明
- **providers/** — 每个 Provider 一个独立文件，封装对应的 API 调用逻辑
- **billing.ts** — 仅在使用 `--with-billing` 时生成，包含 BillingTracker 类

## SDK 特性 (SDK Features)

- **零依赖（Zero Dependency）** — 不依赖 `@synapse-router/*`，仅使用内置 `fetch`
- **TypeScript & Python** — 支持两种语言输出，包含完整的类型定义
- **确定性（Deterministic）** — 相同输入始终生成相同输出，消除运行时意外
- **Billing 集成（Billing Integration）** — `--with-billing` 标志添加 BillingTracker，自动追踪每次调用
- **Schema Lock 管理** — Lock 类似 `package-lock.json`，冻结后不随 Pack 自动变化，提供确定性契约

## 相关命令 (Related Commands)

- [/docs/cli/lock](/docs/cli/lock) — 管理 Schema Lock（列出、迁移、检测过期）
- [/docs/cli/pack](/docs/cli/pack) — 管理 Provider Pack（安装、更新、搜索）
- [/docs/cli](/docs/cli) — 完整 CLI 命令参考
