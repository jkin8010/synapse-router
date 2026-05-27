---
sidebar_position: 4.5
title: synapse sdk
---

# synapse sdk — 从 Provider Pack 生成 SDK

`synapse sdk generate` 命令从单个 Provider Pack 生成零依赖（Zero-Dependency）SDK。支持 TypeScript 和 Python 两种语言输出。添加 `--with-billing` 可包含 BillingTracker 类用于自动配额追踪。

## 参数 (Parameters)

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `--pack <id>` | string | 是 | Pack ID 或路径（如 `openai`、`./packs/openai`） |
| `--lang <lang>` | string | 是 | 目标语言：`typescript` 或 `python` |
| `--output <dir>` | string | 是 | SDK 输出目录 |
| `--provider <id>` | string | 否 | 覆盖 Provider 名称（如用 openai Pack 生成 deepseek SDK） |
| `--base-url <url>` | string | 否 | 覆盖默认 base_url |
| `--with-billing` | flag | 否 | 包含 BillingTracker 类用于配额追踪 |

## 示例 (Examples)

### Example 1 — 生成 TypeScript SDK

```bash
synapse sdk generate --pack openai --lang typescript --output ./generated-sdk
# Generates TypeScript SDK from the openai pack
```

### Example 2 — 生成 Python SDK

```bash
synapse sdk generate --pack openai --lang python --output ./generated-sdk
# Generates Python SDK from the openai pack
```

### Example 3 — 生成时覆盖 Provider

```bash
synapse sdk generate --pack openai --lang typescript --provider deepseek --base-url https://api.deepseek.com/v1 --output ./generated-sdk
# Generates DeepSeek SDK using openai pack structure
```

### Example 4 — 生成带计费追踪的 SDK

```bash
synapse sdk generate --pack openai --lang typescript --output ./sdk --with-billing
# 生成包含 BillingTracker 类的 SDK，用于配额追踪
```

### Example 5 — 从本地 Pack 路径生成

```bash
synapse sdk generate --pack ./my-packs/custom-api --lang typescript --output ./sdk
# Generates SDK from a local pack directory
```

## 输出结构 (Output Structure)

TypeScript 输出（`--lang typescript`）：
```
<output-dir>/
├── index.ts           # 主入口，导出 client + types
├── client.ts          # HTTP 客户端类（零依赖）
├── types.ts           # 类型定义
├── <feature>.ts       # 每个 Feature 独立的类型文件
├── README.md          # 使用文档
├── package.json       # npm 包清单
└── tsconfig.json      # TypeScript 配置
```

Python 输出（`--lang python`）：
```
<output-dir>/
├── __init__.py        # 包初始化，导出 client 类
├── client.py          # HTTP 客户端类（使用 httpx）
├── pyproject.toml     # Python 项目清单
└── README.md          # 使用文档
```

## 相关命令 (Related Commands)

- [/docs/cli/pack](/docs/cli/pack) — 查看和安装 Provider Pack
- [/docs/sdk](/docs/sdk) — SDK 使用详细指南
