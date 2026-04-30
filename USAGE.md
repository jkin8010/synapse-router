# Synapse Router — 使用指南

> **版本**: 0.1.0 | **最后更新**: 2026-04-30

---

## 快速开始

### 1. 安装

```bash
# 从源码安装
git clone https://github.com/useeclaw/synapse-router.git
cd synapse-router
pnpm install
pnpm build

# 全局链接 CLI（推荐开发环境）
cd apps/cli && pnpm link --global
```

安装完成后，`synapse` 命令可在任意目录使用：

```bash
synapse --version
# synapse-router CLI v0.1.0
```

### 2. 首次配置

```bash
# 交互式首次设置（推荐新手）
synapse setup
# > 选择 Provider: OpenAI
# > 输入 API Key: sk-...
# > Base URL [https://api.openai.com/v1]: ↵
# ✅ OpenAI configured!
```

### 3. 查看可用 Provider

```bash
synapse provider list
# Providers:
#   openai       OpenAI                https://api.openai.com/v1
```

---

## 核心工作流

### 工作流一：配置 Provider 并直接调用（最常用）

这是日常开发中最常见的场景 — 配置 API Key 后直接调用 Provider。

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│ 配置 Provider│ ──▶ │ 存储 API Key │ ──▶ │ 连接调用      │ ──▶ │ 获取结果  │
│ (setup)     │     │ (vault set)  │     │ (connect)    │     │ (JSON)   │
└─────────────┘     └──────────────┘     └──────────────┘     └──────────┘
                                              │
                                         Schema Lock
                                       (自动缓存契约)
```

#### 示例：配置 DeepSeek 并调用

```bash
# 步骤 1: 存储 API Key，指定 base_url 和使用的 Pack
synapse vault set deepseek sk-your-key --base-url https://api.deepseek.com/v1 --pack openai
# ✓ deepseek key stored

# 步骤 2: 连接调用
synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"Hello"}],"model":"deepseek-chat"}'
```

首次调用时会自动创建 Schema Lock：

```
Created new lock: chat_deepseek_v1.0.0_f8c7c772
```

后续调用直接使用缓存的 Lock，无需重新协商：

```
Using cached lock: chat_deepseek_v1.0.0_f8c7c772
```

返回结果：

```json
{
  "output": {
    "model": "deepseek-v4-flash",
    "id": "fb538151-61cd-4239-be8d-6b60bc7fdc75",
    "choices": [{
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }],
    "usage": {
      "prompt_tokens": 9,
      "completion_tokens": 46,
      "total_tokens": 55
    }
  },
  "raw": { ... },
  "meta": {
    "provider": "deepseek",
    "feature_id": "chat_post_v1_chat_completions",
    "model": "deepseek-v4-flash",
    "usage": { "input_tokens": 9, "output_tokens": 46 },
    "latency_ms": 4689
  }
}
```

#### 交互式模式

不带 `--input` 参数时，CLI 自动进入交互式模式：

```bash
synapse connect deepseek chat
# > 输入 JSON（或留空使用默认值）:
# {"messages":[{"role":"user","content":"Hello"}],"model":"deepseek-chat"}
#
# ✅ Connected!
```

### 工作流二：Schema 协商 → 连接调用

适用于需要 Agent 声明需求并让 Router 自动匹配 Provider 的场景。

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ 编写 Agent   │ ──▶ │ 协商匹配      │ ──▶ │ 生成/复用     │
│ Schema 文件 │     │ (negotiate)  │     │ Schema Lock  │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                │
                                         ┌──────▼───────┐
                                         │ 连接调用      │
                                         │ (connect)    │
                                         └──────────────┘
```

#### 示例：协商 text-to-image 能力

```bash
# 步骤 1: 准备 Agent Schema
cat > my-agent.json << 'EOF'
{
  "agent_id": "image-gen-agent",
  "agent_name": "Image Generator",
  "version": "1.0.0",
  "features": [{
    "feature_id": "gen-image",
    "intent": "text-to-image",
    "input_schema": {
      "name": "input",
      "fields": [
        { "name": "prompt", "type": "string", "required": true }
      ]
    },
    "output_schema": {
      "name": "output",
      "fields": [
        { "name": "image_url", "type": "string" }
      ]
    }
  }]
}
EOF

# 步骤 2: 运行协商
synapse negotiate my-agent.json
# Matched providers:
#   openai: images_generations_post_v1_images_generations

# 步骤 3: 存储 API Key（如尚未配置）
synapse vault set openai sk-your-key

# 步骤 4: 连接调用
synapse connect openai images_generations --input '{"prompt":"A cat in space","model":"dall-e-3"}'
```

### 工作流三：生成 SDK 并在代码中使用

从 Provider Pack 生成原生 TypeScript SDK，零运行时依赖，可直接 npm publish。

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ Provider    │ ──▶ │ SDK Generator│ ──▶ │ 生成的 SDK   │
│ Pack (DSL)  │     │ (sdk generate)│    │ (client.ts)  │
└─────────────┘     └──────────────┘     └──────────────┘
```

#### 示例：生成 DeepSeek TypeScript SDK

```bash
# 使用 openai Pack 生成 deepseek SDK
synapse sdk generate \
  --pack openai \
  --lang typescript \
  --provider deepseek \
  --base-url https://api.deepseek.com/v1 \
  --output ./deepseek-sdk
```

生成的文件结构：

```
deepseek-sdk/
├── client.ts       # DeepseekClient 类，4 个 Feature 方法
├── types.ts        # TypeScript 类型定义
├── index.ts        # 导出入口
├── package.json    # npm 包配置（零依赖）
├── tsconfig.json   # TypeScript 配置
└── README.md       # 使用说明
```

在代码中使用：

```typescript
import { DeepseekClient } from "./deepseek-sdk";

const client = new DeepseekClient({
  apiKey: "sk-your-key",
  // baseUrl 已在构造时设置，可覆盖
});

const result = await client.chat({
  messages: [{ role: "user", content: "Hello" }],
  model: "deepseek-chat",
});

console.log(result.choices[0].message.content);
```

---

## 命令参考

### CLI 命令总览

| 命令                         | 说明                      | 典型用户      |
| ---------------------------- | ------------------------- | ------------- |
| `synapse setup`              | 交互式首次配置            | 人类开发者    |
| `synapse connect`            | 连接 Provider 并调用      | 人类/AI Agent |
| `synapse negotiate`          | Schema 协商匹配 Provider  | AI Agent      |
| `synapse lock`               | 管理 Schema Lock 缓存     | 开发者        |
| `synapse sdk generate`       | 从 Pack 生成 SDK          | 开发者        |
| `synapse provider list/show` | 查看 Provider 信息        | 所有人        |
| `synapse vault`              | 管理 API Key              | 所有人        |
| `synapse config`             | 管理配置文件              | 开发者        |
| `synapse generate`           | 从 OpenAPI Spec 生成 Pack | Pack 开发者   |

---

### `synapse connect` — 连接并调用 Provider

**最常用的命令**。连接 Provider 并调用其 Feature。

```bash
synapse connect <provider> <intent> [options]
```

**参数**:

| 参数              | 类型   | 必需 | 说明                                                       |
| ----------------- | ------ | ---- | ---------------------------------------------------------- | ---------------------- |
| `<provider>`      | string | ✅   | Provider ID（如 `openai`, `deepseek`）                     |
| `<intent>`        | string | ✅   | Intent ID（如 `chat`, `embeddings`, `images_generations`） |
| `--input <json>`  | string | ❌   | JSON 输入。省略则进入交互式模式                            |
| `--api-key <key>` | string | ❌   | 直接传 Key（不推荐，优先使用 vault）                       |
| `--format <fmt>`  | string | ❌   | 输出格式：`json`                                           | `table`（默认 `json`） |

**示例**:

```bash
# 命令式 — Agent 使用
synapse connect deepseek chat \
  --input '{"messages":[{"role":"user","content":"Hello"}],"model":"deepseek-chat"}'

# 交互式 — 人类使用
synapse connect openai chat
# > 选择 Provider: openai ✅
# > 选择 Feature: Chat Completions
# > 输入 JSON（或留空使用默认值）: {"messages":[{"role":"user","content":"Hi"}],"model":"gpt-4o-mini"}
# ✅ Connected!

# 嵌入到脚本中
RESULT=$(synapse connect deepseek chat \
  --input '{"messages":[{"role":"user","content":"Translate: Hello"}],"model":"deepseek-chat"}')
echo "$RESULT" | jq '.output.choices[0].message.content'
```

**输出结构**:

```json
{
  "output": { ... },       // 标准化的 Provider 响应
  "raw": { ... },          // Provider 原始响应
  "meta": {                // 元数据
    "provider": "deepseek",
    "feature_id": "chat_post_v1_chat_completions",
    "model": "deepseek-v4-flash",
    "usage": { "input_tokens": 9, "output_tokens": 46 },
    "latency_ms": 4689
  }
}
```

---

### `synapse negotiate` — Schema 协商

Agent 声明需求，Router 匹配 Provider 能力。

```bash
synapse negotiate <schema-file> [options]
```

**参数**:

| 参数              | 类型   | 必需 | 说明                       |
| ----------------- | ------ | ---- | -------------------------- | ------- |
| `<schema-file>`   | string | ✅   | Agent Schema JSON 文件路径 |
| `--intent <id>`   | string | ❌   | 限定到指定 Intent          |
| `--provider <id>` | string | ❌   | 限定到指定 Provider        |
| `--format <fmt>`  | string | ❌   | 输出格式：`json`           | `table` |

**Schema 文件结构**:

```json
{
  "agent_id": "my-agent",
  "agent_name": "My Agent",
  "version": "1.0.0",
  "features": [
    {
      "feature_id": "gen-image",
      "intent": "text-to-image",
      "input_schema": {
        "name": "input",
        "fields": [
          { "name": "prompt", "type": "string", "required": true },
          { "name": "width", "type": "number" },
          { "name": "height", "type": "number" }
        ]
      },
      "output_schema": {
        "name": "output",
        "fields": [{ "name": "image_url", "type": "string" }]
      }
    }
  ]
}
```

**示例**:

```bash
synapse negotiate my-agent.json
# Matched providers:
#   openai: images_generations_post_v1_images_generations
```

> 协商结果会自动缓存为 Schema Lock。后续相同的 `connect` 调用直接复用缓存。

---

### `synapse lock` — 管理 Schema Lock

查看、管理和迁移缓存的 Schema Lock。

```bash
synapse lock <subcommand> [options]
```

| 子命令              | 说明                               |
| ------------------- | ---------------------------------- |
| `list`              | 列出所有缓存的 Schema Lock         |
| `show <lock-id>`    | 查看 Lock 详情                     |
| `remove <lock-id>`  | 删除 Lock（下次 connect 重新生成） |
| `migrate <lock-id>` | 迁移到最新 Pack 版本               |
| `outdated`          | 检查过期的 Lock                    |

**示例**:

```bash
# 列出所有缓存
synapse lock list
# Schema Locks:
#   Lock ID                                            Intent          Provider     Version
#   ✓ chat_deepseek_v1.0.0_f8c7c772                      chat            deepseek     v1.0.0

# 查看 Lock 详情
synapse lock show chat_deepseek_v1.0.0_f8c7c772

# 检查过期 Lock
synapse lock outdated
# No outdated locks found.

# 删除 Lock
synapse lock remove chat_deepseek_v1.0.0_f8c7c772
```

---

### `synapse sdk generate` — 生成 SDK

从 Provider Pack 生成原生 SDK，零运行时依赖。

```bash
synapse sdk generate --pack <id> --lang <lang> --output <dir> [options]
```

**参数**:

| 参数               | 类型   | 必需 | 说明                                                   |
| ------------------ | ------ | ---- | ------------------------------------------------------ | -------- |
| `--pack <id>`      | string | ✅   | Pack ID（如 `openai`）                                 |
| `--lang <lang>`    | string | ✅   | 目标语言：`typescript`                                 | `python` |
| `--output <dir>`   | string | ✅   | 输出目录                                               |
| `--provider <id>`  | string | ❌   | 覆盖 Provider 名（如用 openai pack 生成 deepseek SDK） |
| `--base-url <url>` | string | ❌   | 覆盖默认 base_url                                      |

**示例**:

```bash
# 生成 openai SDK
synapse sdk generate --pack openai --lang typescript --output ./openai-sdk

# 生成 deepseek SDK（用 openai pack）
synapse sdk generate \
  --pack openai \
  --lang typescript \
  --provider deepseek \
  --base-url https://api.deepseek.com/v1 \
  --output ./deepseek-sdk

# 生成 Python SDK
synapse sdk generate --pack openai --lang python --output ./openai-py
```

---

### `synapse vault` — 管理 API Key

```bash
synapse vault set <provider> <key> [options]    # 存储 Key
synapse vault list                               # 列出已存储 Provider
synapse vault get <provider>                     # 获取 Key 明文
synapse vault remove <provider>                  # 删除 Key
synapse vault verify <provider>                  # 验证 Key 格式
```

**`vault set` 选项**:

| 选项               | 说明                                                       |
| ------------------ | ---------------------------------------------------------- |
| `--base-url <url>` | 设置 Provider 的 base_url（写入 config）                   |
| `--pack <name>`    | 指定使用的 Pack（如 `openai`，供 DeepSeek 等兼容厂商使用） |

**示例**:

```bash
# 基本用法
synapse vault set openai sk-your-key

# 兼容 OpenAI 格式的 Provider（如 DeepSeek）
synapse vault set deepseek sk-your-key \
  --base-url https://api.deepseek.com/v1 \
  --pack openai
```

---

### `synapse config` — 管理配置

```bash
synapse config set <provider> <key> <value>     # 设置配置项
synapse config get <provider> <key>             # 获取配置项
synapse config list                             # 列出所有配置
```

**示例**:

```bash
synapse config list
# Providers:
#   deepseek:
#     base_url: https://api.deepseek.com/v1
#     pack: openai
```

---

### `synapse setup` — 交互式首次配置

引导式配置向导，适合初次使用。

```bash
synapse setup
# Welcome to Synapse Router!
# Let's configure your first provider.
#
# 1. Select a provider:
#    [1] OpenAI
#    [2] DeepSeek
#    ...
#
# 2. Enter API Key: sk-...
# 3. Base URL [https://api.openai.com/v1]: ↵
#
# ✅ OpenAI configured!
```

---

### `synapse provider` — 查看 Provider 信息

```bash
synapse provider list                          # 列出所有 Pack
synapse provider show <id>                     # 查看 Provider 详情
```

**示例**:

```bash
synapse provider show openai
# {
#   "provider": { "id": "openai", "name": "OpenAI", ... },
#   "service": { "base_url": "https://api.openai.com/v1", ... },
#   "features": [
#     { "id": "chat_post_v1_chat_completions", "intent": "chat", ... },
#     { "id": "embeddings_post_v1_embeddings", "intent": "embeddings", ... },
#     ...
#   ]
# }
```

---

### `synapse generate` — 从 OpenAPI Spec 生成 Pack

```bash
synapse generate <openapi-file> --provider <id> --name <name>
```

**示例**:

```bash
synapse generate ./my-api-spec.yaml \
  --provider my-api \
  --name "My API"
# ✓ Pack generated: packs/my-api/
```

---

## 数据目录

| 路径                     | 用途                                         |
| ------------------------ | -------------------------------------------- |
| `~/.synapse/keys/`       | Vault 加密存储（AES-256-GCM）                |
| `~/.synapse/schemas/`    | Schema Lock 缓存（类似 `package-lock.json`） |
| `~/.synapse/config.json` | 全局配置（base_url、pack 映射等）            |
| `./packs/`               | 预置 Provider Pack                           |

---

## HTTP API

### 启动服务

```bash
synapse serve
# Listening on http://0.0.0.0:3000
```

### 端点

| 方法   | 路径                    | 说明          |
| ------ | ----------------------- | ------------- |
| GET    | `/health`               | 健康检查      |
| GET    | `/providers`            | 列出 Provider |
| GET    | `/providers/:id`        | Provider 详情 |
| POST   | `/negotiate`            | Schema 协商   |
| POST   | `/connect`              | 连接调用      |
| POST   | `/vault/keys`           | 存储 Key      |
| GET    | `/vault/keys`           | 列出 Key      |
| DELETE | `/vault/keys/:provider` | 删除 Key      |

### 示例

```bash
# 健康检查
curl http://localhost:3000/health
# {"status":"ok","version":"0.1.0"}

# 连接调用
curl -X POST http://localhost:3000/connect \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "deepseek",
    "intent": "chat",
    "input": {
      "messages": [{"role": "user", "content": "Hello"}],
      "model": "deepseek-chat"
    }
  }'
```

---

## 兼容 OpenAI 格式的其他模型

DeepSeek、月之暗面、智谱、百川等国产模型均兼容 OpenAI API 格式，**唯一差异是 `base_url`**。

| Provider | base_url                               | 兼容能力                                      |
| -------- | -------------------------------------- | --------------------------------------------- |
| OpenAI   | `https://api.openai.com/v1`            | Chat ✅ / Embeddings ✅ / Image ✅ / Audio ✅ |
| DeepSeek | `https://api.deepseek.com/v1`          | Chat ✅                                       |
| 月之暗面 | `https://api.moonshot.cn/v1`           | Chat ✅                                       |
| 智谱     | `https://open.bigmodel.cn/api/paas/v4` | Chat ✅                                       |
| 百川     | `https://api.baichuan-ai.com/v1`       | Chat ✅                                       |

**使用方式**:

```bash
# 方式 1: vault 配置时指定 base_url 和 pack
synapse vault set deepseek sk-xxx --base-url https://api.deepseek.com/v1 --pack openai
synapse connect deepseek chat --input '{"messages":[...],"model":"deepseek-chat"}'

# 方式 2: SDK 生成时指定
synapse sdk generate --pack openai --lang typescript \
  --provider deepseek --base-url https://api.deepseek.com/v1 \
  --output ./deepseek-sdk
```

---

## MCP Server

在 Claude Desktop / Cursor 等 MCP 客户端中配置：

```json
{
  "mcpServers": {
    "synapse-router": {
      "command": "npx",
      "args": ["@synapse-router/mcp-server"]
    }
  }
}
```

---

## 开发者指南

### 从源码构建

```bash
cd synapse-router
pnpm install
pnpm build
pnpm test           # 运行测试
pnpm typecheck      # 类型检查
```

### 添加新 Provider Pack

#### 方法一：自动生成（推荐）

```bash
synapse generate ./openapi.json --provider my-api --name "My API"
```

#### 方法二：手动创建

1. 创建目录：`mkdir -p packs/my-provider/dsl`
2. 编写 `provider-card.json`（参考 `packs/openai/provider-card.json`）
3. 在 `dsl/` 下为每个 Feature 创建 DSL 文件（参考 `packs/openai/dsl/`）
4. 验证：`synapse provider list` 应看到新 Provider

> 📚 完整 Pack 开发指南 → [docs/PACKS.md](docs/PACKS.md)

---

## 常见问题

### Q: `connect` 命令报错 "No API key found"

确保已用 `vault set` 存储对应 Provider 的 Key：

```bash
synapse vault set deepseek sk-xxx --base-url https://api.deepseek.com/v1 --pack openai
```

### Q: 如何让 connect 使用新的 base_url？

修改 config：

```bash
synapse vault set deepseek sk-xxx --base-url https://new-url.com/v1 --pack openai
```

或删除 Lock 缓存后重新连接：

```bash
synapse lock remove chat_deepseek_v1.0.0_xxx
synapse connect deepseek chat --input '{...}'
```

### Q: 生成的 SDK 如何发布到 npm？

生成的 SDK 是零依赖 npm 包，直接 publish：

```bash
cd ./deepseek-sdk
npm install
npm run build
npm publish --access public
```

### Q: Schema Lock 的作用是什么？

类似 `package-lock.json`，确保 Schema 协商结果可缓存、可复用、版本连续。同一 `intent + provider` 的调用只需协商一次，后续自动复用，避免重复计算和版本漂移。
