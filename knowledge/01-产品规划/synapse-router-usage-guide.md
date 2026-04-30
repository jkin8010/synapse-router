# Synapse Router 使用指南

> **面向**: 开发者 / AI Agent 接入者 / 产品验证者
> **日期**: 2026-04-30
> **状态**: Phase 1 开发中 — 部分功能尚未实现，标注 ⚠️

---

## 1. 概述

Synapse Router 是一个本地运行的多 Provider AI 路由层。它的核心价值：

- **Schema 协商** — Agent 声明需求，Router 匹配 Provider 能力，锁定双方契约
- **API Key 安全** — 本地加密存储，永不明文落盘
- **Provider Pack** — 即插即用的 Provider 适配包
- **策略路由** — 按 cheap/fast/quality 选择最优 Provider

---

## 2. 安装

```bash
# 全局安装 CLI
npm install -g @synapse-router/cli

# 验证安装
synapse --version
# synapse-router CLI v0.1.0
```

---

## 3. 快速开始

### 3.1 查看 Provider

```bash
synapse provider list
# Providers:
#   openai       OpenAI                https://api.openai.com/v1
```

### 3.2 配置 API Key

```bash
# 存储 Key（自动从 Pack 检测 auth_type）
synapse vault set openai sk-your-key-here
# ✓ openai key stored

# 验证 Key 格式
synapse vault verify openai
# ✓ openai key format is valid

# 查看已存储的 Provider
synapse vault list
# Stored providers:
#   openai
```

### 3.3 查看 Provider 详情

```bash
synapse provider show openai
# 输出完整的 provider-card.json
```

---

## 4. 核心流程

### 4.1 完整使用链路（目标态）

```
安装 → 配置 Key → 协商 → 执行 → 获取结果
```

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ 安装 Pack │───▶│ 配置 Key │───▶│ Schema   │───▶│ 执行调用 │
│          │    │ (Vault)  │    │ 协商     │    │ (直连)   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                       │               │
                                       ▼               ▼
                                  锁定契约         标准化结果
                               (schema-lock)    (canonical fields)
```

### 4.2 当前实现状态

| 步骤 | 命令 | 状态 | 备注 |
|------|------|------|------|
| 查看 Provider | `synapse provider list/show` | ✅ 可用 | 从本地 packs/ 目录加载 |
| 配置 Key | `synapse vault set/list/get/remove/verify` | ✅ 可用 | PBKDF2 加密，权限 0600 |
| Schema 协商 | `synapse negotiate <schema-file>` | ⚠️ 部分 | 能匹配 intent，未锁定契约 |
| 连接调用 | `synapse connect` | ❌ 未实现 | 核心能力缺口（原 execute，更名为 connect） |
| HTTP API | `synapse serve` | ⚠️ 部分 | /providers, /vault, /health 可用；/connect 未实现 |
| MCP Server | `synapse mcp start` | ❌ 未实现 | |
| Pack 生成 | `synapse generate <source>` | ✅ 可用 | 从 OpenAPI Spec 生成 |

---

## 5. 兼容 OpenAI 格式的其他模型

### 5.1 核心洞察

DeepSeek、月之暗面、智谱、百川等国产模型均兼容 OpenAI API 格式，**唯一差异是 `base_url`**：

| Provider | base_url | 兼容程度 |
|----------|----------|---------|
| OpenAI | `https://api.openai.com/v1` | 基准 |
| DeepSeek | `https://api.deepseek.com/v1` | Chat ✅ / Embeddings ❌ |
| 月之暗面 | `https://api.moonshot.cn/v1` | Chat ✅ |
| 智谱 | `https://open.bigmodel.cn/api/paas/v4` | Chat ✅ |
| 百川 | `https://api.baichuan-ai.com/v1` | Chat ✅ |

### 5.2 当前限制 ⚠️

**`service.base_url` 目前只是描述性元数据**，运行时代码不消费它。`OpenAIProvider.generate()` 是 mock 实现。

### 5.3 目标用法（待实现）

**命令式（Agent 用）**:
```bash
# 方式 1: vault 配置时指定 base_url
synapse vault set deepseek sk-deepseek-xxx --base-url https://api.deepseek.com/v1 --pack openai

# 连接调用
synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"Hello"}],"model":"deepseek-chat"}'

# 方式 2: connect 时覆盖
synapse connect openai chat --base-url https://api.deepseek.com/v1 --input '{"messages":[...],"model":"deepseek-chat"}'

# 方式 3: 环境变量
export SYNAPSE_DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
export SYNAPSE_DEEPSEEK_API_KEY=sk-deepseek-xxx
```

**交互式（人类用）**:
```bash
# 引导式配置
synapse setup
# > 选择 Provider: DeepSeek
# > 输入 Key: ****
# > Base URL [https://api.deepseek.com/v1]: ↵
# ✅ DeepSeek configured!

# 引导式调用
synapse connect
# > 选择 Provider: deepseek ✅
# > 选择 Feature: Chat Completions
# > 输入消息: Hello, who are you?
# ✅ Connected!
```

---

## 6. HTTP API 使用

### 6.1 启动 API Server

```bash
synapse serve
# Listening on http://0.0.0.0:3000
```

### 6.2 API 端点

```
GET  /health                    健康检查
GET  /providers                 列出所有 Provider
GET  /providers/:id             查看 Provider 详情

POST /vault/keys                存储 API Key
GET  /vault/keys                列出已存储 Key
DELETE /vault/keys/:provider    删除 Key

POST /v1/negotiate              ⚠️ Schema 协商（部分实现）
POST /v1/execute/:schema_id     ❌ 执行（未实现）
```

### 6.3 示例

```bash
# 健康检查
curl http://localhost:3000/health
# {"status":"ok","version":"0.1.0"}

# 列出 Provider
curl http://localhost:3000/providers
# [{"id":"openai","name":"OpenAI","base_url":"https://api.openai.com/v1",...}]

# 存储 Key
curl -X POST http://localhost:3000/vault/keys \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","key":"sk-xxx","auth_type":"Bearer"}'
```

---

## 7. Provider Pack 结构

### 7.1 内置 Pack

```
packs/
└── openai/
    ├── provider-card.json          # Provider 能力声明
    └── dsl/                        # Agent Schema 定义
        ├── chat_post_v1_chat_completions.json
        ├── embeddings_post_v1_embeddings.json
        ├── images_generations_post_v1_images_generations.json
        └── audio_transcriptions_post_v1_audio_transcriptions.json
```

### 7.2 provider-card.json 关键字段

```json
{
  "provider": { "id": "openai", "name": "OpenAI" },
  "service": {
    "id": "openai",
    "base_url": "https://api.openai.com/v1",
    "auth_type": "Bearer"
  },
  "features": [
    {
      "id": "chat_post_v1_chat_completions",
      "intent": "chat",
      "name": "Chat Completions",
      "field_mappings": [
        { "canonical_field": "prompt", "provider_field": "messages" },
        { "canonical_field": "model", "provider_field": "model" }
      ]
    }
  ]
}
```

### 7.3 生成自定义 Pack

```bash
# 从 OpenAPI Spec 生成
synapse generate ./my-api-spec.yaml \
  --provider "my-provider" \
  --name "My Provider" \
  --output ./generated-packs/my-provider

# 生成后的 Pack 可放入 packs/ 目录使用
```

---

## 8. 配置文件

### 8.1 目录结构

```
~/.synapse/
├── keys/                         # API Key 加密存储
│   ├── vault.json                # 加密的 Key 数据
│   └── vault.key                 # 加密密钥
├── packs/                        # Registry 安装的 Pack（Phase 2）
└── config.json                   # 全局配置（Phase 1 待实现）
```

### 8.2 期望的 config.json 结构（待实现）

```json
{
  "providers": {
    "openai": {
      "base_url": "https://api.openai.com/v1",
      "timeout_ms": 30000
    }
  },
  "router": {
    "default_strategy": "fast"
  }
}
```

---

## 9. 开发者本地调试

### 9.1 从源码构建

```bash
cd ~/workspace/qise-tech/synapse-router
pnpm install
pnpm build

# 运行测试
pnpm test

# 本地 CLI
pnpm --filter @synapse-router/cli start provider list
```

### 9.2 Pack 开发

```bash
# 1. 在 packs/ 下创建新目录
mkdir packs/my-provider

# 2. 创建 provider-card.json（参考 packs/openai/）

# 3. 创建 dsl/ 目录和 Feature JSON（参考 packs/openai/dsl/）

# 4. 验证
synapse provider list    # 应看到新 Provider
synapse provider show my-provider
```

---

## 10. 已知限制（Phase 1 当前）

| 限制 | 影响 | 计划 |
|------|------|------|
| connector 未实现 | 无法真正调用 Provider API | **P0 阻塞项**（原 execute，更名 connector） |
| base_url 不可覆盖 | 无法兼容 DeepSeek 等厂商 | **P0 阻塞项** |
| CLI 交互式模式 | 人类使用门槛高 | **P1**（缺参数自动降级交互式） |
| config.json 未实现 | 无法持久化用户偏好 | P1 |
| Schema Lock 未实现 | 协商后无法锁定契约 | P1 |
| MCP Server 未实现 | 无法通过 MCP 接入 | P1 |
| 无集成测试 | 端到端流程未验证 | P0 |
| CLI help 不够详细 | Agent 无法快速理解接口 | P0（分层+示例+标注必选/可选） |

---

## 11. 术语表

| 术语 | 含义 |
|------|------|
| **Provider** | AI 服务提供商（OpenAI、DeepSeek 等） |
| **Pack** | 一个 Provider 的适配包（provider-card + dsl + schema） |
| **Feature** | Provider 提供的一项能力（如 Chat Completions） |
| **Intent** | Feature 的语义分类（chat、text-to-image、embeddings 等） |
| **Field Mapping** | Provider 字段到 Canonical 字段的映射关系 |
| **Canonical Field** | Router 标准化的字段名（如 `prompt`、`model`） |
| **Schema Negotiation** | Agent 声明需求 → Router 匹配 Provider → 锁定契约 |
| **Vault** | 本地加密的 API Key 存储 |

---

最后更新：2026-04-30
