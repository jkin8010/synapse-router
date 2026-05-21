---
sidebar_position: 2
title: CLI Command Reference
---

# CLI 命令参考 (CLI Command Reference)

Synapse CLI 是 Router 的开发者工具入口。所有 Schema 协商（Schema Negotiation）、Provider 路由（Provider Routing）、账单管理（Billing Management）、Pack 管理（Pack Management）、API Key 管理（Vault Management）和 SDK 生成（SDK Generation）都在 CLI 中完成。

所有命令遵循统一的 `synapse <command> [subcommand] [options]` 格式。每个命令可通过 `--help` 参数查看详细的用法说明和参数列表。输出格式默认为人可读的文本，支持 `--format json` 切换为结构化 JSON 输出便于程序处理。

## 命令概览 (Command Overview)

| 命令 | 描述 | 页面 |
|------|------|------|
| `synapse connect` | 连接 Provider 并执行功能（intent） | [/docs/cli/connect](/docs/cli/connect) |
| `synapse vault` | 管理加密 API Key（AES-256-GCM） | [/docs/cli/vault](/docs/cli/vault) |
| `synapse evolve` | 生成零依赖 SDK | [/docs/cli/evolve](/docs/cli/evolve) |
| `synapse route` | 多维评分路由 | [/docs/cli/route](/docs/cli/route) |
| `synapse billing` | 账单管理与配额查看 | [/docs/cli/billing](/docs/cli/billing) |
| `synapse pack` | 管理 Provider Pack | [/docs/cli/pack](/docs/cli/pack) |
| `synapse lock` | 管理 Schema Lock | [/docs/cli/lock](/docs/cli/lock) |
| `synapse config` | 配置管理（点号记法） | [/docs/cli/config](/docs/cli/config) |
| `synapse setup` | 交互式初始化向导 | [/docs/cli/setup](/docs/cli/setup) |

## 快速导航 (Quick Navigation)

按使用类别分组，便于快速定位：

- **核心操作 (Core Operations):** [connect](/docs/cli/connect)、[route](/docs/cli/route)、[evolve](/docs/cli/evolve)
- **配置与管理 (Configuration & Management):** [setup](/docs/cli/setup)、[config](/docs/cli/config)
- **安全与资源 (Security & Resources):** [vault](/docs/cli/vault)、[billing](/docs/cli/billing)、[pack](/docs/cli/pack)、[lock](/docs/cli/lock)

## 通用约定 (General Conventions)

### Provider ID

Provider ID 使用小写字母和连字符（kebab-case）格式，如 `deepseek`、`openai`、`stability-ai`。ID 在整个系统中作为唯一标识，用于 vault 存储、路由选择、账单追踪等场景。

### Intent 类型 (Intent Types)

Intent 表示 Agent 的意图类型，用于匹配 Provider 的 Feature：

- `chat` — 聊天对话（Chat Completion）
- `text-to-image` — 文生图（Text-to-Image Generation）
- `embeddings` — 嵌入向量（Embedding Generation）
- `speech-to-text` — 语音转文字（Speech-to-Text）

### API Key 安全

API Key 使用 AES-256-GCM 加密算法存储，永不明文落盘（never stored in plaintext）。所有日志输出自动脱敏（automatically redacted），确保 Key 不会出现在 Trace 或 Span 中。Key 的生命周期管理通过 `synapse vault` 命令完成。

### 首次使用

首次使用 Synapse CLI 时，建议按以下顺序操作：

1. 运行 `synapse setup` 交互式向导完成初始化配置
2. 使用 `synapse vault set <provider> <key>` 存储 API Key
3. 使用 `synapse connect <provider> <intent>` 测试连接
4. 根据需求配置 billing 和路由策略

## 链接索引 (Link Index)

- [connect](/docs/cli/connect)
- [vault](/docs/cli/vault)
- [route](/docs/cli/route)
- [evolve](/docs/cli/evolve)
- [billing](/docs/cli/billing)
- [pack](/docs/cli/pack)
- [lock](/docs/cli/lock)
- [config](/docs/cli/config)
- [setup](/docs/cli/setup)
