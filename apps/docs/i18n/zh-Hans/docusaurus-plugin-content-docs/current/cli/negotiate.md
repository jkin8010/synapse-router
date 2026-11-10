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
|----------|------|------|
| `synapse negotiate`（无参数） | 显式，交互式 | 在 TTY 终端中启动完整的交互式协商 |
| `synapse negotiate --intent <x> --provider <y>` | 显式，非交互式 | 手动触发协商并查看锁的详细信息 |
| `synapse connect <x> <y>` | 隐式（首次调用） | 如果无缓存的 Schema Lock，自动执行协商 |
| `synapse connect <x> <y> --no-cache` | 隐式（强制） | 即使存在有效缓存锁也强制重新协商 |
| `synapse sdk generate --pack <id>` | 批量 | 从更新后的 Pack 重新生成 SDK（按 Pack 逐个执行） |

## 交互模式 (Interactive Mode)

在 TTY 终端中运行 `synapse negotiate`（不带任何参数）将启动一个 8 步交互式流程。在非 TTY 环境（管道、CI）中，命令会打印错误并以退出码 1 退出——脚本场景请使用 `--intent` 和 `--provider`。

### 交互流程 (Interactive Flow)

**第 1 步 — 选择 Intent**

使用 `promptSearch` 扫描所有已安装的 Provider Pack（内置 packs、本地 `.synapse/packs/` 和用户 `~/.synapse/packs/`）以收集唯一的 intent 值。键入关键字进行大小写不敏感的过滤。

```
? Select an intent (type to filter):
  chat
  embeddings
  text-to-image
  speech-to-text
```

*层级: required — 用户必须选择一个 intent，无默认值。*

**第 2 步 — 选择 Provider**

选择 intent 后，只显示支持该 intent 的 Provider。使用已过滤的 `promptSelect` 列表：

```
? Select a provider for "chat":
  deepseek — DeepSeek
  openai — OpenAI
  groq — Groq
```

*层级: required — 用户必须选择一个 provider，无默认值。*

**第 3 步 — 查看 Feature Schema**

加载 Provider Card 和匹配的 feature。Schema 表以颜色编码的字段标记显示：

- **绿色 `[required]`** — 必填字段
- **黄色 `[optional]`** — 可选字段
- 花括号中显示枚举值

```
  Feature: Chat Completions
  No description

  Input Fields (5):
    messages : array    [required]
    model : string      [required]
    temperature : number [optional]
    max_tokens : number  [optional] {64|128|256|512|1024|2048}
    stream : boolean     [optional]

  Output Fields (3):
    id : string
    choices : array
    usage : object
```

**第 4 步 — 字段选择**

可通过复选框取消选择可选字段。必填字段被锁定（已勾选且不可操作），无法移除：

```
? Select input fields to include (required fields are locked):
  ❯◉ messages : array (required)     [locked]
   ◉ model : string (required)       [locked]
   ◉ temperature : number (optional)
   ◯ max_tokens : number (optional)
   ◉ stream : boolean (optional)
```

*层级: recommended — Enter 接受所有已勾选的默认字段。*

**第 5 步 — LLM Key 检测**

协商器按顺序在三个位置检查 LLM API Key：

1. **Vault** — `synapse vault get negotiator-llm`
2. **环境变量** — `OPENAI_API_KEY`
3. **配置** — `synapse config get negotiator.apiKey`

如果未找到 Key，将显示警告横幅并询问用户是否继续使用确定性存根（stub）：

```
⚠  No LLM API Key configured for negotiation.
  Without an LLM key, the schema will be generated using a deterministic stub.
  This produces a generic placeholder, not a real negotiation result.

  To configure an LLM key:
    synapse vault set negotiator-llm <your-api-key>
  Or set: export OPENAI_API_KEY=<your-key>

? Continue with deterministic stub? (Y/n)
```

*层级: contextual — 仅在未检测到 LLM Key 时显示。*

**第 6 步 — Lock Diff 预览**

在保存前，协商器会比较现有 Schema Lock 与新协商结果。显示新增字段（绿色）、移除字段（红色）或"无字段变化"信息：

```
  Lock Diff Preview
  ==================================================
  Current lock:  chat_openai_v1.2.3_abc12345
    Created:     2026-05-20T10:30:00Z
    Fields:      5
  New negotiation:
    Schema:      chat_openai_v1.2.3_def67890
    Fields:      6
    + Added:     temperature, max_tokens
```

对于首次创建的 Lock，显示简单的提示信息。

**第 7 步 — 确认保存**

```
? Save this Schema Lock? (Y/n) › Yes
```

确认后，Lock 持久化到 `~/.synapse/schemas/`。如果拒绝，会提示使用 `--dry-run` 进行预览。

*层级: confirmation — Enter 接受默认值（yes）。*

**第 8 步 — 协商后路由菜单**

协商成功后，5 选项菜单让您选择下一步操作：

```
? Select an action:
  ❯ Test connection  (synapse connect)
    Generate SDK (synapse sdk generate)
    Show SDK integration code
    Open in Playground
    Save and exit
```

每个选项显示对应的命令或代码片段。选择"Test connection"显示可运行的 `synapse connect` 命令。选择"Generate SDK"显示 `synapse sdk generate` 命令。"Show SDK integration code"显示导入和使用示例。"Open in Playground"在默认浏览器中打开 Playground（[http://localhost:5173](http://localhost:5173)）：

```
  Run this command to test:
  synapse connect openai chat --input '{"...":"..."}'

  Add --billing preCall to track costs.
```

*层级: confirmation — 单次选择，然后返回。*

### 中断处理 (Interruption Handling)

- **SIGINT/SIGTERM**：启动时注册清理处理器，退出时移除。通过 `interrupted` 标志防止重复触发。退出码 130。无孤儿 Lock 文件。
- **ExitPromptError**：捕获 `@inquirer/prompts` 的 Ctrl+C 处理并路由到清理处理器。
- **信号处理器生命周期**：处理函数在函数入口注册，在函数退出时移除。

### 提示层级分类 (Prompt Tier Classification)

交互式流程中的每个提示按层级分类：

| 层级 | 目的 | 示例 |
|------|------|------|
| **Required** | 必须提供值，无默认值 | Intent 选择、Provider 选择 |
| **Recommended** | 预填合理默认值 | 字段选择（所有字段已勾选） |
| **Contextual** | 仅在相关时显示 | LLM Key 警告横幅 |
| **Confirmation** | 带有默认值的是/否 | Lock 保存确认、路由菜单选择 |

## 非交互模式 (Non-Interactive Mode)

命令支持两种非交互操作模式：

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

## 选项 (Options)

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--intent <intent>` | Feature intent（如 `chat`、`text-to-image`） | — |
| `--provider <provider>` | Provider ID（如 `openai`、`deepseek`） | — |
| `--no-cache` | 强制重新协商（删除缓存 Lock 并重新验证） | `false` |
| `--format <fmt>` | 输出格式：`json` 或 `table` | `table` |
| `--yes` | 跳过所有提示，接受默认值 | `false` |
| `--dry-run` | 运行完整管道，预览结果，不保存 Lock | `false` |
| `--no-save` | 成功完成协商但不保存 Schema Lock | `false` |
| `--no-interactive` | 强制非交互模式（信息缺失时直接失败） | `false` |

## 输出 (Output)

### 缓存 Lock

当存在缓存锁时（非交互模式）：

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

### 新 Lock

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

### Stub 警告

当没有 LLM API Key 时协商，生成的 schema 是确定性占位符：

```
⚠  Negotiation used deterministic stub (no LLM key configured).
  The resulting schema is a generic placeholder, not a real negotiation.
  To get a meaningful AI-generated schema, configure an LLM key.
```

### Lock Diff（交互模式）

当已有 Lock 被替换时：

```
  Lock Diff Preview
  ==================================================
  Current lock:  chat_openai_v1.2.3_abc12345
    Created:     2026-05-20T10:30:00Z
    Fields:      5
  New negotiation:
    Schema:      chat_openai_v1.2.3_def67890
    Fields:      6
    + Added:     temperature, max_tokens
```

## 示例 (Examples)

### 示例 1 — 交互式协商

```bash
synapse negotiate
```

启动 8 步交互式流程。详见上方[交互模式](#交互模式-interactive-mode)部分的逐步说明。

### 示例 2 — 交互模式带干运行预览

```bash
synapse negotiate --dry-run
```

运行完整交互式管道，但在确认步骤**不保存** Schema Lock。适用于无副作用的 Schema 浏览。

### 示例 3 — 显式无缓存协商

```bash
synapse negotiate --intent chat --provider deepseek --no-cache
# Removed cached lock: chat_deepseek_v1.0.0_abc
# Created new lock: chat_deepseek_v1.0.0_def
```

### 示例 4 — 扫描所有 Provider 的匹配 Intent

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

### 示例 5 — JSON 输出用于脚本

```bash
synapse negotiate --intent chat --provider openai --format json
```

### 示例 6 — 预览模式（干运行）

```bash
synapse negotiate --intent chat --provider openai --dry-run
# Full pipeline runs, results displayed, Lock not saved
# [Dry run — Lock not saved. Re-run without --dry-run to save.]
```

### 示例 7 — 协商后查看缓存 Lock 详情

```bash
synapse lock list
# chat_openai_v1.2.3_def67890

synapse lock show chat_openai_v1.2.3_def67890
# Full lock details: input schema, output schema, field mappings
```

## 相关命令 (Related Commands)

- [synapse lock](/docs/cli/lock) — 查看、管理和迁移现有的 Schema Lock
- [synapse connect](/docs/cli/connect) — 连接 Provider 执行 Intent（隐式协商）
- [SDK 使用指南](/docs/sdk) — 从 Provider Pack 生成零依赖 SDK
- [synapse pack](/docs/cli/pack) — 管理已安装的 Provider Pack
