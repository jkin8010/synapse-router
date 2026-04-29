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

## 📖 快速开始

### 1. 安装

```bash
npm install -g @synapse-router/cli
```

### 2. 配置 API Key

```bash
# 存储 API Key（自动从 Pack 检测 auth_type）
synapse vault set openai sk-your-key-here
synapse vault set stability sk-your-key-here

# 验证 Key 格式
synapse vault verify openai
# ✓ openai key format is valid
```

### 3. 使用示例

```bash
# 查看可用 Provider
synapse provider list
# Providers:
#   openai       OpenAI                https://api.openai.com/v1
#   replicate    Replicate             https://api.replicate.com/v1
#   stability    Stability AI          https://api.stability.ai/v1
#   comfyui      ComfyUI               http://127.0.0.1:8188

# 启动 HTTP API
synapse serve
# Listening on http://0.0.0.0:3000
```

```bash
# 准备 Agent Schema 并协商
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
        "fields": [{ "name": "image_url", "type": "string" }]
      },
      "capabilities": [{ "kind": "image-generation", "modalities": ["png"] }]
    }
  ]
}
EOF

synapse negotiate my-agent.json
# Matched providers:
#   stability: text_to_image_post_v1_generation_text2img
#   openai: images_generations_post_v1_images_generations
```

```bash
# 从 OpenAPI Spec 生成 Provider Pack
synapse generate ./openapi.json --provider my-api
# ✓ Pack generated: packs/my-api/
```

> 📚 更多示例见下方 [🔧 接入端](#-接入端) 章节

## 🔑 核心概念

### Provider / Service / Pack 的关系

| 概念 | 角色 | 说明 |
|------|------|------|
| **Provider** | 身份标识 | Provider 的唯一 ID、名称、文档链接 |
| **Service** | 服务配置 | 服务地址、API 版本、认证方式等运行参数 |
| **Pack** | 打包单元 | 一个目录 = 一个 Provider Pack，包含 `provider-card.json` + `dsl/` 文件 |

每个 Provider Pack 的结构：

```
packs/<provider-id>/
├── provider-card.json   # Provider 身份 + Service 配置 + Features 声明
└── dsl/                 # 每个 Feature 一个 Agent Schema DSL 文件
    ├── feature_1.json
    └── feature_2.json
```

**工作流程**：

```
Agent 发出 AgentSchema（"我需要什么"）
  → Router 匹配 Provider Pack 的 Features（按 Intent + 能力）
  → 生成 ServerSchema（"我承诺提供什么"）
  → Agent 按锁定契约执行调用
```

### 双 Schema 契约

| Schema | 角色 | 类比 |
|--------|------|------|
| **AgentSchema** | Agent 持有的需求声明 | `package.json` |
| **ServerSchema** | 服务端锁定的契约 | `package-lock.json` |

协商流程：Agent 发出 `AgentSchema` → Router 匹配 Provider → 生成 `ServerSchema` → 后续执行严格遵循锁定契约。

## 📐 架构

```
┌─────────────────────────────────────────────────────────┐
│                       AI Agent                          │
│  "我需要 text-to-image, 1024x1024, 偏好质量"             │
└──────────────────────┬──────────────────────────────────┘
                       │ AgentSchema（需求声明）
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
                      │ ServerSchema（锁定契约）
                      ▼
        ┌─────────────┬──────────────┬──────────────┐
        │   OpenAI    │  Replicate   │  Stability   │  ...
        │   API       │  API         │  AI API      │
        └─────────────┴──────────────┴──────────────┘
```

### 组件架构

```
synapse-router/
├── packages/
│   ├── core/              # Schema 类型定义 + 校验 + 规范化
│   ├── negotiator/        # Schema 协商引擎（Intent 匹配 + 能力验证）
│   ├── providers/         # Provider Registry + Adapter 接口
│   ├── router/            # 路由策略（cheap/fast/quality）+ 执行引擎
│   ├── vault/             # API Key 加密存储（AES-256-GCM + OS Keychain）
│   ├── pack-generator/    # 从 OpenAPI Spec 自动生成 Provider Pack
│   └── sdk/               # 客户端 SDK（TypeScript）
├── apps/
│   ├── api/               # HTTP API Server（Express）
│   ├── cli/               # CLI 工具（Commander）
│   ├── mcp-server/        # MCP Server（Model Context Protocol）
│   └── playground/        # 本地可视化调试界面
└── packs/                 # 预置 Provider Pack
    ├── openai/
    ├── replicate/
    ├── stability/
    └── comfyui/
```

## 🔧 接入端

### CLI

```bash
synapse provider list                       # 列出所有 Provider Pack
synapse provider show <id>                  # 查看 Provider 详情
synapse vault set <provider> <key>          # 存储 API Key
synapse vault list                          # 列出已存储的 Key
synapse vault verify <provider>            # 验证 Key 格式
synapse negotiate <schema-file>            # 运行 Schema 协商
synapse execute <provider> <feature> <input>  # 执行 Provider 调用
```

> 完整 CLI 参考 → [apps/cli/README.md](apps/cli/README.md)

### HTTP API

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

> 完整 API 参考 → [docs/API.md](docs/API.md)

### MCP Server

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

| Tool             | 说明                  |
|------------------|-----------------------|
| `vault_set_key`  | 存储 Provider API Key  |
| `vault_list_keys`| 列出已存储的 Key       |
| `vault_get_key`  | 获取指定 Provider 的 Key |
| `provider_list`  | 列出所有 Provider Pack |
| `provider_show`  | 查看 Provider 详情     |
| `negotiate`      | 运行 Schema 协商       |
| `execute`        | 执行 Provider 调用     |

> 完整 MCP 参考 → [apps/mcp-server/README.md](apps/mcp-server/README.md)

## 📦 预置 Provider Pack

| Provider     | 功能                                                 | Auth    |
|-------------|------------------------------------------------------|---------|
| **OpenAI**   | Chat, Embeddings, Image Generation, Audio Transcription | Bearer  |
| **Replicate**| Predictions, Trainings                               | Bearer  |
| **Stability AI**| Text to Image, Image to Image                     | APIKey  |
| **ComfyUI**  | Workflow Execution                                   | APIKey  |

> Pack 开发指南 → [docs/PACKS.md](docs/PACKS.md)

## 🧪 开发指南

### 环境准备

```bash
# 需要 Node.js 22+ 和 pnpm 10+
corepack enable
pnpm install
```

### 构建 & 测试

```bash
pnpm build          # 构建所有包
pnpm test           # 运行测试（250 tests, 0 fail）
pnpm typecheck      # 类型检查
```

### 如何添加新 Provider Pack

#### 方法一：从 OpenAPI Spec 自动生成（推荐）

```bash
# CLI 方式
npx @synapse-router/pack-generator --from-url https://api.example.com/openapi.json

# 编程方式
npx tsx -e '
import { generatePackFromURL, writePack } from "@synapse-router/pack-generator";

const { providerCard, dslFiles } = await generatePackFromURL(
  "https://api.example.com/openapi.json",
  { providerId: "my-api", providerName: "My API" }
);
await writePack("./packs/my-api", providerCard, dslFiles);
'
```

#### 方法二：手动创建

1. 在 `packs/` 下创建目录：`mkdir -p packs/my-provider/dsl`
2. 编写 `provider-card.json`（定义 Provider 身份 + Service 配置 + Features）
3. 在 `dsl/` 下为每个 Feature 创建 Agent Schema 文件
4. 运行测试验证 Pack 格式

> 📚 完整 Pack 开发指南 → [docs/PACKS.md](docs/PACKS.md)

### 提交 Pull Request

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/my-feature`
3. 提交更改：`git commit -m 'feat: add my feature'`
4. 推送分支：`git push origin feature/my-feature`
5. 创建 Pull Request

## License

[Apache License 2.0](LICENSE)
