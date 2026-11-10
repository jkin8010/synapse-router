---
sidebar_position: 3
title: SDK Guide
---

# SDK 使用指南 (SDK Guide)

Synapse Router 通过 `synapse sdk generate` 命令将 Schema 协商（Schema Negotiation）结果转换为零依赖（Zero-Dependency）的纯函数 SDK 代码。生成的 SDK 不依赖任何 `@synapse-router/*` 包，只使用内置 `fetch`，可在任何 JavaScript/TypeScript 环境中运行。

## 生成工作流程 (Generation Workflow)

`sdk generate` 命令的处理流程包含四个步骤：

1. **读取 Provider Pack（Load Provider Pack）** — 按 pack id 或路径加载指定的 Provider Pack
2. **读取 Schema Lock（Read Schema Lock）** — 使用 Lock 中的字段映射（Field Mappings）建立 canonical ↔ provider 映射
3. **生成代码（Generate Code）** — 根据字段映射生成 TypeScript / Python SDK 代码
4. **输出（Output）** — 写入 `--output` 目录，零外部依赖

## 命令参数 (Command Parameters)

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--pack <id>` | string | 是 | — | Pack ID 或路径（如 `openai`、`./packs/openai`） |
| `--lang <lang>` | string | 是 | — | 目标语言：`typescript` \| `python` |
| `--output <dir>` | string | 是 | — | SDK 输出目录 |
| `--provider <id>` | string | 否 | Pack 自带 | 覆盖生成 SDK 中的 Provider 名称 |
| `--base-url <url>` | string | 否 | Pack 默认值 | 覆盖默认 base URL |
| `--with-billing` | flag | 否 | false | 在生成的 SDK 中包含 BillingTracker 用量追踪类 |

## 使用示例 (Usage Examples)

### Example 1 — 基础生成 (Basic Generation)

```bash
synapse sdk generate --pack openai --lang typescript --output ./synapse-sdk
```

执行后会在当前目录下生成 `./synapse-sdk/` 目录，包含 TypeScript SDK 代码，可直接在项目中引用。

### Example 2 — 包含 Billing 追踪 (With Billing Tracking)

```bash
synapse sdk generate --pack openai --lang typescript --output ./synapse-sdk --with-billing
```

生成的 SDK 中包含 `BillingTracker` 类，自动追踪每次 API 调用的用量。适用于需要计费和配额管理的生产环境。

### Example 3 — 复用同一 Pack 生成其他 Provider 的 SDK

```bash
synapse sdk generate --pack openai --lang typescript \
  --provider deepseek \
  --base-url https://api.deepseek.com/v1 \
  --output ./synapse-sdk
```

从 OpenAI 兼容 Pack 生成 DeepSeek SDK，适用于提供 OpenAI 兼容 API 的厂商。

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
