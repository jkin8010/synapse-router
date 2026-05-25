---
sidebar_position: 4
title: synapse negotiate
---

# synapse negotiate — Schema 协商 (Schema Negotiation)

`negotiate` 命令将 Agent 的 Intent 匹配到 Provider 的 Feature 能力，并创建一个 **Schema Lock** — 一个冻结的 Schema 契约（Schema Contract），定义了 Agent 需求与 Provider API 之间的字段映射。这是"开发时协商，运行时无感"原则的核心体现。

Schema Lock 缓存在 `~/.synapse/schemas/` 中，在后续调用中自动复用。它们在显式失效前保持不可变（Immutable），确保确定性行为。

## 协商时机 (Negotiation Timing)

Schema 协商发生在工作流的以下节点：

| 触发方式 | 时机 | 说明 |
|---------|------|------|
| `synapse negotiate --intent <x> --provider <y>` | 显式 | 手动触发协商并查看锁的详细信息 |
| `synapse connect <x> <y>` | 隐式（首次调用） | 如果无缓存的 Schema Lock，自动执行协商 |
| `synapse connect <x> <y> --no-cache` | 隐式（强制） | 即使存在有效缓存锁也强制重新协商 |
| `synapse evolve --tune` | 批量 | 批量生成 SDK 时重新协商所有 Schema Lock |

## 操作模式 (Modes)

命令支持两种操作模式：

### 模式 1 — Schema 文件扫描 (Schema File Scan)

扫描所有已安装的 Provider Pack，查找其 Feature 与 Agent Schema 文件中的 Intent 匹配的 Provider：

```bash
synapse negotiate <schema-file>
```

**示例：**
```bash
synapse negotiate my-agent.json
# Matched providers:
#   openai: chat, text-to-image
#   deepseek: chat
#   stability: text-to-image
```

### 模式 2 — Intent + Provider（Schema Lock）

协商单个 Intent/Provider 对并创建（或从缓存获取）Schema Lock：

```bash
synapse negotiate --intent <intent> --provider <provider> [--no-cache]
```

**参数 (Parameters):**

| 参数 | 说明 |
|------|------|
| `--intent <intent>` | Intent 类型，如 `chat`、`text-to-image`、`embeddings` |
| `--provider <provider>` | Provider ID，如 `openai`、`deepseek` |
| `--no-cache` | 强制重新协商，忽略缓存的 Schema Lock |

## 输出 (Output)

当存在缓存锁时：
```
Using cached lock: chat_openai_v1.2.3_abc12345
  Intent:    chat
  Provider:  openai
  Feature:   chat_post_v1_chat_completions
  Pack:      v1.2.3
  Input:     5 fields
  Output:    3 fields
  Mappings:  4 fields
```

当创建新锁时（或 `--no-cache` 强制重新协商）：
```
Created new lock: chat_openai_v1.2.3_def67890
  Intent:    chat
  Provider:  openai
  Feature:   chat_post_v1_chat_completions
  Pack:      v1.2.3
  Input:     5 fields
  Output:    3 fields
  Mappings:  4 fields
```

## 示例 (Examples)

### Example 1 — 无缓存协商

```bash
synapse negotiate --intent chat --provider deepseek --no-cache
# Removed cached lock: chat_deepseek_v1.0.0_abc
# Created new lock: chat_deepseek_v1.0.0_def
```

### Example 2 — 扫描所有 Provider 的匹配 Intent

```bash
synapse negotiate my-agent-schema.json
```

其中 `my-agent-schema.json` 包含：
```json
{
  "features": [
    { "intent": "chat" },
    { "intent": "text-to-image" }
  ]
}
```

### Example 3 — 协商后查看缓存锁详情

```bash
synapse lock list
# chat_openai_v1.2.3_def67890

synapse lock show chat_openai_v1.2.3_def67890
# Full lock details: input schema, output schema, field mappings
```

## 相关命令 (Related Commands)

- [synapse lock](/docs/cli/lock) — 查看、管理和迁移现有的 Schema Lock
- [synapse connect](/docs/cli/connect) — 连接 Provider 执行 Intent（隐式协商）
- [synapse evolve --tune](/docs/cli/evolve) — 批量生成 SDK 时重新协商所有 Schema Lock
- [synapse pack](/docs/cli/pack) — 管理已安装的 Provider Pack
