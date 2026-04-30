# @synapse-router/cli

Synapse Router 命令行工具。

## 安装

```bash
npm install -g @synapse-router/cli
```

## 命令概览

```
synapse <command> [options]

Commands:
  connect <provider> <intent>       连接 Provider 并调用 Feature（核心命令）
  setup                             交互式首次配置向导
  config set|get|list               管理配置 (~/.synapse/config.json)
  provider list                     列出所有 Provider Pack
  provider show <id>                查看 Provider 详情
  vault set|list|get|remove|verify  管理 API Key
  negotiate <schema-file>           运行 Schema 协商
  lock list|show|remove|migrate     管理 Schema Lock 缓存
  sdk generate                      从 Pack 生成 SDK
  generate <source>                 从 OpenAPI Spec 生成 Pack
  serve                             启动 HTTP API

Options:
  --help, -h               显示帮助
  --version, -v            显示版本号
```

## 快速开始

### 首次使用

```bash
synapse setup
# > 选择 Provider: DeepSeek
# > 输入 API Key: ****
# > Base URL [https://api.deepseek.com/v1]: ↵
# ✅ DeepSeek configured!
```

### 连接调用

```bash
# 命令式 — Agent 使用
synapse connect deepseek chat \
  --input '{"messages":[{"role":"user","content":"Hello"}],"model":"deepseek-chat"}'

# 交互式 — 人类使用
synapse connect openai chat
# > 输入 JSON（或留空使用默认值）: {"messages":[{"role":"user","content":"Hi"}]}
# ✅ Connected!
```

## Connect 命令

### `synapse connect <provider> <intent>`

连接指定 Provider 并调用其 Feature。**这是最常用的命令**。

```bash
synapse connect <provider> <intent> [options]
```

**参数**:

| 参数 | 必需 | 说明 |
|------|------|------|
| `<provider>` | ✅ | Provider ID（如 `openai`, `deepseek`） |
| `<intent>` | ✅ | Intent ID（如 `chat`, `embeddings`, `images_generations`） |
| `--input <json>` | ❌ | JSON 输入，省略则进入交互式模式 |
| `--api-key <key>` | ❌ | 直接传 Key（优先使用 vault） |

**Schema Lock**: 首次连接自动生成并缓存 Schema Lock，后续相同 `intent + provider` 调用自动复用缓存。

## Vault 命令

### `synapse vault set <provider> <key>`

存储 API Key。

```bash
# 基本用法
synapse vault set openai sk-proj-xxxx

# 兼容 OpenAI 格式的 Provider
synapse vault set deepseek sk-xxx --base-url https://api.deepseek.com/v1 --pack openai
```

Key 使用 AES-256-GCM 加密存储在 `~/.synapse/keys/`。

### `synapse vault list`

列出已存储的 Provider。

```bash
synapse vault list
# Stored providers:
#   openai
#   deepseek
```

### `synapse vault get <provider>`

获取 API Key 明文。

```bash
synapse vault get openai
# sk-proj-xxxx
```

### `synapse vault remove <provider>`

删除 API Key。

```bash
synapse vault remove openai
# ✓ openai key removed
```

### `synapse vault verify <provider>`

验证 Key 格式。

```bash
synapse vault verify openai
# ✓ openai key format is valid
```

## Negotiate 命令

### `synapse negotiate <schema-file>`

运行 Schema 协商，匹配支持的 Provider。

```bash
synapse negotiate agent.json
# Matched providers:
#   openai: chat_post_v1_chat_completions
```

## Lock 命令

管理 Schema Lock 缓存。

```bash
synapse lock list                    # 列出所有缓存
synapse lock show <lock-id>          # 查看 Lock 详情
synapse lock remove <lock-id>        # 删除 Lock
synapse lock migrate <lock-id>       # 迁移到最新 Pack 版本
synapse lock outdated                # 检查过期 Lock
```

## SDK 命令

### `synapse sdk generate`

从 Pack 生成原生 SDK，零运行时依赖。

```bash
synapse sdk generate --pack openai --lang typescript --output ./sdk
synapse sdk generate --pack openai --lang python --output ./py-sdk
synapse sdk generate --pack openai --lang typescript \
  --provider deepseek --base-url https://api.deepseek.com/v1 \
  --output ./deepseek-sdk
```

## Config 命令

```bash
synapse config set <provider> <key> <value>
synapse config get <provider> <key>
synapse config list
```

## Setup 命令

交互式首次配置：

```bash
synapse setup
```

## 数据目录

| 路径                      | 用途              |
|--------------------------|-------------------|
| `~/.synapse/keys/`       | Vault 加密存储     |
| `~/.synapse/schemas/`    | Schema Lock 缓存   |
| `~/.synapse/config.json` | 全局配置           |
| `./packs/`               | 预置 Provider Pack |
