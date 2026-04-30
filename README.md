# Synapse Router

**面向 AI Agent 的受控 Schema 协商与多 Provider 路由层**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version: 0.1.0](https://img.shields.io/badge/Version-0.1.0-blue.svg)]()
[![Tests: 280+ passing](https://img.shields.io/badge/Tests-280%2B%20passing-brightgreen.svg)]()

Synapse Router 位于 AI Agent 与多 Provider API 之间，确保每次请求在执行前都有**明确契约**。它让 Provider 选择、Schema 兼容性和路由决策变得可观察、可测试、可替换。

## 核心特性

- 🔄 **Schema 协商** — Agent 声明需求，Router 自动匹配 Provider 能力，锁定双方契约
- 🔒 **Schema Lock** — 协商结果可缓存、可复用、版本连续（类似 `package-lock.json`）
- 🔐 **API Key 安全存储** — PBKDF2 加密 + OS Keychain 集成，Key 永不明文落盘
- 🧩 **Provider Pack 体系** — 每个 Provider 一个 Pack，声明能力、字段映射、定价，即插即用
- 🔌 **多接入方式** — CLI、HTTP API、MCP Server，适配不同 Agent 架构
- 🛠️ **SDK 生成** — 从 Pack DSL 生成原生 TypeScript / Python SDK，零运行时依赖

## 📖 快速开始

### 1. 安装

```bash
git clone https://github.com/useeclaw/synapse-router.git
cd synapse-router && pnpm install && pnpm build
cd apps/cli && pnpm link --global
```

### 2. 配置 Provider

```bash
# 交互式首次配置
synapse setup

# 或手动配置
synapse vault set openai sk-your-key-here

# 兼容 OpenAI 格式的 Provider（如 DeepSeek）
synapse vault set deepseek sk-xxx --base-url https://api.deepseek.com/v1 --pack openai
```

### 3. 连接调用

```bash
# 命令式 — Agent 使用
synapse connect deepseek chat \
  --input '{"messages":[{"role":"user","content":"Hello"}],"model":"deepseek-chat"}'

# 交互式 — 人类使用
synapse connect openai chat
```

### 4. 生成 SDK

```bash
# 生成零依赖 TypeScript SDK
synapse sdk generate --pack openai --lang typescript \
  --provider deepseek --base-url https://api.deepseek.com/v1 \
  --output ./deepseek-sdk
```

## 🔑 核心概念

### 工作流

```
安装 → 配置 Key → Schema 协商 → 连接调用 → 生成 SDK
  │         │           │             │            │
  ▼         ▼           ▼             ▼            ▼
pnpm     vault     negotiate      connect      sdk generate
 build    set         │               │            │
                       ▼               ▼            ▼
                  Schema Lock     Provider      原生代码
                  (自动缓存)       API 调用      (零依赖)
```

### Provider Pack

每个 Provider 一个 Pack，包含身份、服务配置和功能声明：

```
packs/<provider-id>/
├── provider-card.json   # Provider 能力声明
└── dsl/                 # 每个 Feature 一个 Agent Schema
    ├── chat_post_v1_chat_completions.json
    ├── embeddings_post_v1_embeddings.json
    └── ...
```

### Schema Lock

类似 `package-lock.json`：协商结果缓存到 `~/.synapse/schemas/`，相同 `intent + provider` 后续调用自动复用，避免重复协商和版本漂移。

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
│  │ Schema 协商  │  │ Key 加密 │  │  OpenAI/DeepSeek  │  │
│  └──────┬──────┘  └────┬─────┘  └─────────┬─────────┘  │
│         │              │                   │            │
│         └──────┬───────┘                   │            │
│                ▼                           │            │
│  ┌─────────────────────────────────────────┐            │
│  │   Connector + Lock (缓存契约)            │◄───────────┘  │
│  │   • base_url 运行时覆盖                  │            │
│  │   • 字段映射 + 转换                      │            │
│  │   • Schema 缓存/复用                     │            │
│  └──────────────────┬──────────────────────┘            │
└─────────────────────┼───────────────────────────────────┘
                      │ HTTP 请求（Provider API）
                      ▼
        ┌─────────────┬──────────────┬──────────────┐
        │   OpenAI    │   DeepSeek   │  Replicate   │  ...
        │   API       │   API        │  API         │
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
│   ├── connector/         # 薄连接层（HTTP 调用 + 字段映射 + base_url 覆盖）
│   ├── lock/              # Schema Lock（缓存/存储/迁移/过期检测）
│   ├── vault/             # API Key 加密存储（AES-256-GCM + OS Keychain）
│   ├── pack-generator/    # 从 OpenAPI Spec 自动生成 Provider Pack
│   └── sdk-generator/     # 从 Pack DSL 生成 TypeScript / Python SDK
├── apps/
│   ├── cli/               # CLI 工具（connect/setup/config/vault/lock/sdk）
│   ├── api/               # HTTP API Server
│   ├── mcp-server/        # MCP Server（Model Context Protocol）
│   └── playground/        # 本地可视化调试界面
└── packs/                 # 预置 Provider Pack
    └── openai/            # OpenAI Pack（供 DeepSeek 等兼容厂商复用）
        ├── provider-card.json
        └── dsl/
```

## 🔧 接入端

### CLI

```bash
synapse setup                         # 交互式首次配置
synapse connect <provider> <intent>   # 连接并调用（核心命令）
synapse negotiate <schema-file>       # Schema 协商
synapse lock list|show|remove|migrate  # 管理 Schema Lock
synapse sdk generate                  # 生成 SDK
synapse provider list                 # 列出 Provider Pack
synapse provider show <id>            # 查看 Provider 详情
synapse vault set <provider> <key>    # 存储 API Key
synapse vault list|get|remove|verify  # Vault 管理
synapse config set|get|list           # 配置管理
synapse generate <source>             # 从 OpenAPI Spec 生成 Pack
synapse serve                         # 启动 HTTP API
```

> 📚 完整使用指南 → [USAGE.md](USAGE.md)

### HTTP API

| 方法 | 路径             | 说明               |
| ---- | ---------------- | ------------------ |
| POST | `/connect`       | 连接调用 Provider  |
| POST | `/negotiate`     | 协商 Schema        |
| GET  | `/providers`     | 列出可用 Provider  |
| GET  | `/providers/:id` | 查看 Provider 详情 |
| GET  | `/health`        | 健康检查           |

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

## 📦 预置 Provider Pack

| Pack       | Provider                                  | 功能                           | base_url |
| ---------- | ----------------------------------------- | ------------------------------ | -------- |
| **openai** | OpenAI, DeepSeek, 月之暗面, 智谱, 百川 等 | Chat, Embeddings, Image, Audio | 可配置   |

> 兼容 OpenAI API 格式的 Provider 可复用 openai Pack，只需配置 `base_url`。

## 🧪 开发指南

### 环境准备

```bash
# 需要 Node.js 22+ 和 pnpm 10+
corepack enable
pnpm install
pnpm build
```

### 构建 & 测试

```bash
pnpm build          # 构建所有包
pnpm test           # 运行测试（280+ tests, 0 fail）
pnpm typecheck      # 类型检查
```

### 如何添加新 Provider

#### 方法一：从 OpenAPI Spec 自动生成

```bash
synapse generate ./openapi.json --provider my-api --name "My API"
```

#### 方法二：手动创建

1. 在 `packs/` 下创建目录
2. 编写 `provider-card.json` + `dsl/` 文件
3. 运行 `synapse provider list` 验证

> 📚 Pack 开发指南 → [docs/PACKS.md](docs/PACKS.md)

## License

[Apache License 2.0](LICENSE)
