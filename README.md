# Synapse Router

**面向 AI Agent 的受控 Schema 协商与多 Provider 路由层**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Tests: 250 passing](https://img.shields.io/badge/Tests-250%20passing-brightgreen.svg)]()

Synapse Router 位于 Agent、工具、模型和 Provider API 之间，确保每次请求在执行前都有**明确契约**。它让 Provider 选择、Schema 兼容性和路由决策变得可观察、可测试、可替换。

## 核心特性

- 🔄 **Schema 协商** — Agent 声明需求，Router 自动匹配 Provider 能力，锁定双方契约（类似 `package-lock.json`）
- 🔐 **API Key 安全存储** — PBKDF2 加密 + OS Keychain 集成，Key 永不明文落盘
- 🧩 **Provider Pack 体系** — 每个 Provider 一个 Pack，声明能力、字段映射、定价，即插即用
- 🛣️ **策略路由** — 按 cheap/fast/quality 策略选择最优 Provider，支持 fallback
- 🔌 **多接入方式** — CLI、HTTP API、MCP Server，适配不同 Agent 架构

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                       AI Agent                          │
│  "我需要 text-to-image, 1024x1024, 偏好质量"             │
└──────────────────────┬──────────────────────────────────┘
                       │ Agent Schema（需求声明）
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   Synapse Router                        │
│  ┌─────────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  Negotiator  │  │   Vault  │  │  Provider Packs   │  │
│  │ Schema 协商  │  │ Key 加密 │  │  OpenAI/Replicate │  │
│  └──────┬──────┘  └────┬─────┘  │  Stability/ComfyUI│  │
│         │              │        └─────────┬─────────┘  │
│         └──────┬───────┘                   │            │
│                ▼                           │            │
│  ┌─────────────────────────────────────────┐            │
│  │          Router（策略路由 + 执行引擎）   │◄───────────┘  │
│  └──────────────────┬──────────────────────┘            │
└─────────────────────┼───────────────────────────────────┘
                      │ Server Schema（锁定契约）
                      ▼
        ┌─────────────┬──────────────┬──────────────┐
        │   OpenAI    │  Replicate   │  Stability   │  ...
        │   API       │  API         │  AI API      │
        └─────────────┴──────────────┴──────────────┘
```

## 快速开始

### 安装

```bash
npm install -g @synapse-router/cli
```

### 配置 API Key

```bash
# 存储 OpenAI Key（自动从 Pack 检测 auth_type）
synapse vault set openai sk-your-key-here

# 存储 Stability AI Key
synapse vault set stability sk-your-key-here

# 验证 Key 格式
synapse vault verify openai
# ✓ openai key format is valid
```

### 查看 Provider

```bash
synapse provider list
# Providers:
#   openai       OpenAI                https://api.openai.com/v1
#   replicate    Replicate             https://api.replicate.com/v1
#   stability    Stability AI          https://api.stability.ai/v1
#   comfyui      ComfyUI               http://127.0.0.1:8188

# 查看某个 Provider 的详细信息
synapse provider show openai
```

### 启动 HTTP API

```bash
# 使用 CLI
synapse serve
# 或直接启动
npx @synapse-router/api
```

### 协商 + 执行示例

```bash
# 1. 准备 Agent Schema 文件
cat > my-agent.json << 'EOF'
{
  "agent_id": "my-image-agent",
  "agent_name": "Image Generator",
  "version": "1.0.0",
  "access_protocol": { "kind": "api", "auth_type": "Bearer" },
  "features": [
    {
      "feature_id": "gen-image",
      "feature_name": "Generate Image",
      "intent": "text-to-image",
      "input_schema": {
        "name": "image_input",
        "fields": [
          { "name": "prompt", "type": "string", "required": true },
          { "name": "width", "type": "number" },
          { "name": "height", "type": "number" }
        ]
      },
      "output_schema": {
        "name": "image_output",
        "fields": [
          { "name": "image_url", "type": "string" }
        ]
      },
      "capabilities": [{ "kind": "image-generation", "modalities": ["png"] }]
    }
  ]
}
EOF

# 2. 通过 CLI 协商
synapse negotiate my-agent.json
# Matched providers:
#   stability: text_to_image_post_v1_generation_text2img
#   openai: images_generations_post_v1_images_generations

# 3. 通过 HTTP API 协商 + 执行
curl -X POST http://localhost:3000/negotiate \
  -H "Content-Type: application/json" \
  -d '{"agent_schema": <上面 Agent Schema 的内容>}'

# 响应返回 negotiation_id，用于执行
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "negotiation_id": "<返回的 ID>",
    "input": { "prompt": "A cat in space", "width": 1024, "height": 1024 }
  }'
```

## API 概览

| 方法   | 路径                    | 说明                |
|--------|------------------------|---------------------|
| POST   | `/negotiate`           | 协商 Schema          |
| POST   | `/execute`             | 执行 Provider 调用    |
| GET    | `/providers`           | 列出可用 Provider     |
| GET    | `/providers/:id`       | 查看 Provider 详情    |
| GET    | `/vault/keys`          | 列出存储的 Key        |
| POST   | `/vault/keys`          | 存储 API Key          |
| DELETE | `/vault/keys/:provider`| 删除 Key             |
| POST   | `/vault/verify/:provider` | 验证 Key 格式      |
| GET    | `/health`              | 健康检查             |

> 完整 API 参考 → [apps/api/README.md](apps/api/README.md)

## MCP Server

Synapse Router 提供 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) Server，支持 stdio 传输。

### 集成到 Claude Desktop / Cursor 等 MCP 客户端

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

### 7 个 Tools

| Tool             | 说明                  |
|------------------|-----------------------|
| `vault_set_key`  | 存储 Provider API Key  |
| `vault_list_keys`| 列出已存储的 Key       |
| `vault_get_key`  | 获取指定 Provider 的 Key |
| `provider_list`  | 列出所有 Provider Pack |
| `provider_show`  | 查看 Provider 详情     |
| `negotiate`      | 运行 Schema 协商       |
| `execute`        | 执行 Provider 调用     |

### 2 个 Resources

| URI                | 说明                  |
|--------------------|-----------------------|
| `providers://list` | 所有 Provider Pack 摘要 |
| `vault://status`   | Vault 状态与 Key 计数   |

> 完整 MCP 参考 → [apps/mcp-server/README.md](apps/mcp-server/README.md)

## CLI 命令参考

```bash
synapse provider list                       # 列出所有 provider packs
synapse provider show <id>                  # 查看 provider 详情

synapse vault set <provider> <key>          # 存储 API key
synapse vault list                          # 列出存储的 keys
synapse vault get <provider>               # 获取 key 值
synapse vault remove <provider>            # 删除 key
synapse vault verify <provider>            # 验证 key 格式
synapse vault rotate <provider>            # 轮换加密密码

synapse negotiate <schema-file>            # 运行 schema 协商
synapse execute <provider> <feature> <input>  # 执行 provider feature

synapse --help                             # 帮助
synapse --version                          # 版本号
```

> 完整 CLI 参考 → [apps/cli/README.md](apps/cli/README.md)

## Provider Pack 体系

Provider Pack 是 Synapse Router 的核心抽象——每个 Provider 一个 Pack，声明其能力、字段映射和定价信息。

```
packs/
└── openai/
    ├── provider-card.json    # Provider 核心卡片（能力声明）
    └── dsl/                  # Agent Schema DSL 文件
        └── chat_post_v1_chat_completions.json
```

### 预置 Pack

| Provider     | 功能                                                 |
|-------------|------------------------------------------------------|
| **OpenAI**   | Chat Completions, Embeddings, Audio Transcriptions, Image Generations |
| **Replicate**| Predictions, Trainings                               |
| **Stability AI**| Text to Image, Image to Image                     |
| **ComfyUI**  | Workflow (post_v1_prompt)                            |

### 创建自定义 Pack

```bash
# 从 OpenAPI Spec 生成
npx @synapse-router/pack-generator --from-url https://api.example.com/openapi.json

# 或手动创建 provider-card.json
```

> 完整 Pack 参考 → [packs/README.md](packs/README.md)

## 项目结构

```
synapse-router/
├── packages/
│   ├── core/                  # Schema 类型 + 校验 + 规范化
│   ├── negotiator/            # Schema 协商引擎
│   ├── providers/             # Provider Registry + Adapter 接口
│   ├── router/                # 路由策略 + 执行引擎
│   ├── vault/                 # API Key 加密存储
│   ├── pack-generator/        # Provider Pack 生成器（从 OpenAPI Spec）
│   └── sdk/                   # 客户端 SDK
├── packs/                     # 预置 Provider Pack
│   ├── openai/
│   ├── replicate/
│   ├── stability/
│   └── comfyui/
├── apps/
│   ├── api/                   # HTTP API Server
│   ├── cli/                   # CLI 工具
│   ├── mcp-server/            # MCP Server
│   └── playground/            # 本地 Playground
├── knowledge/                 # 知识库（产品规划 + 技术架构文档）
└── package.json
```

## 开发指南

### 环境准备

```bash
# 需要 Node.js 22+ 和 pnpm 10+
corepack enable
pnpm install
```

### 构建 & 测试

```bash
pnpm build          # 构建所有包
pnpm test           # 运行所有测试（250 tests, 0 fail）
pnpm typecheck      # 类型检查
```

### 如何贡献

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/my-feature`
3. 提交更改：`git commit -m 'feat: add my feature'`
4. 推送分支：`git push origin feature/my-feature`
5. 创建 Pull Request

### 创建新的 Provider Pack

1. 在 `packs/` 下创建目录：`packs/my-provider/`
2. 编写 `provider-card.json`，声明 Provider 信息和功能列表
3. 在 `dsl/` 下为每个功能创建 Agent Schema 文件
4. 运行测试确保 Pack 格式正确

或使用 Pack Generator 从 OpenAPI Spec 自动生成：

```typescript
import { generatePackFromURL, writePack } from "@synapse-router/pack-generator";

const { providerCard, dslFiles } = await generatePackFromURL(
  "https://api.example.com/openapi.json",
  { providerId: "my-provider", providerName: "My Provider" }
);

await writePack("./packs/my-provider", providerCard, dslFiles);
```

> Pack Generator 详细用法 → [packages/pack-generator/README.md](packages/pack-generator/README.md)

## 双 Schema 设计

Synapse Router 的核心是 **双 Schema 契约设计**：

| Schema        | 角色         | 类比                |
|---------------|-------------|---------------------|
| **AgentSchema** | Agent 持有的需求声明 | `package.json`  |
| **ServerSchema** | 服务端锁定的契约 | `package-lock.json` |

协商流程：Agent 发出 `AgentSchema`（"我需要什么"），Router 匹配 Provider 能力后生成 `ServerSchema`（"我承诺提供什么"），后续执行严格遵循锁定契约。

```
AgentSchema                  Negotiation                 ServerSchema
(需求声明)        ────────►  (匹配 + 锁定)  ────────►    (锁定契约)
```

## License

[Apache License 2.0](LICENSE)

---

> **Registry 闭源说明**：本仓库开源核心路由、协商、加密等代码。接入各个 Provider API 的适配层（Registry）由平台闭源提供，包含 API 对接、错误处理、重试策略等"脏活累活"。
