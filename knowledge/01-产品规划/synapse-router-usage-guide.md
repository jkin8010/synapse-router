# Synapse Router 使用指南

> **面向**: 开发者 / AI Agent 接入者 / 产品验证者
> **版本**: 0.1.0 | **日期**: 2026-04-30
> **状态**: Phase 1 已完成 ✅

---

## 1. 概述

Synapse Router 是一个本地运行的多 Provider AI 路由层。核心价值：

- **Schema 协商** — Agent 声明需求，Router 匹配 Provider 能力，锁定契约
- **Schema Lock** — 协商结果可缓存、可复用（类似 `package-lock.json`）
- **API Key 安全** — PBKDF2 加密，永不明文落盘
- **Provider Pack** — 即插即用的 Provider 适配包
- **SDK 生成** — 从 Pack DSL 生成原生 TypeScript/Python SDK，零依赖
- **base_url 运行时覆盖** — 兼容 OpenAI 格式的其他厂商（DeepSeek、月之暗面等）

---

## 2. 安装

```bash
# 从源码
git clone https://github.com/useeclaw/synapse-router.git
cd synapse-router && pnpm install && pnpm build
cd apps/cli && pnpm link --global

# 验证
synapse --version
# synapse-router CLI v0.1.0
```

---

## 3. 快速开始

### 3.1 首次配置

```bash
synapse setup
# 交互式向导
```

### 3.2 配置 Provider

```bash
# OpenAI
synapse vault set openai sk-your-key

# DeepSeek（兼容 OpenAI 格式）
synapse vault set deepseek sk-xxx --base-url https://api.deepseek.com/v1 --pack openai
```

### 3.3 查看 Provider

```bash
synapse provider list
# Providers:
#   openai       OpenAI                https://api.openai.com/v1
```

---

## 4. 核心流程

### 4.1 完整使用链路

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ 安装 Pack │───▶│ 配置 Key │───▶│ Schema   │───▶│ 连接调用 │───▶│ 生成 SDK │
│          │    │ (Vault)  │    │ 协商     │    │ (Connect)│    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                                       │               │
                                       ▼               ▼
                                  Schema Lock      标准化结果
                                 (自动缓存)      (canonical fields)
```

### 4.2 实现状态

| 步骤          | 命令                                       | 状态 | 备注                     |
| ------------- | ------------------------------------------ | ---- | ------------------------ |
| 查看 Provider | `synapse provider list/show`               | ✅   | 从本地 packs/ 加载       |
| 配置 Key      | `synapse vault set/list/get/remove/verify` | ✅   | PBKDF2 加密              |
| Schema 协商   | `synapse negotiate <schema-file>`          | ✅   | 匹配 intent + 缓存 Lock  |
| 连接调用      | `synapse connect`                          | ✅   | 命令式 + 交互式双模式    |
| Schema Lock   | `synapse lock list/show/remove/migrate`    | ✅   | 缓存/迁移/过期检测       |
| SDK 生成      | `synapse sdk generate`                     | ✅   | TypeScript + Python 骨架 |
| HTTP API      | `synapse serve`                            | ✅   | /connect + /negotiate    |
| MCP Server    | `synapse mcp start`                        | ⚠️   | 基础框架已实现           |
| Config        | `synapse config set/get/list`              | ✅   | ~/.synapse/config.json   |
| Setup         | `synapse setup`                            | ✅   | 交互式向导               |

---

## 5. 兼容 OpenAI 格式的其他模型

| Provider | base_url                               | 兼容能力                                      |
| -------- | -------------------------------------- | --------------------------------------------- |
| OpenAI   | `https://api.openai.com/v1`            | Chat ✅ / Embeddings ✅ / Image ✅ / Audio ✅ |
| DeepSeek | `https://api.deepseek.com/v1`          | Chat ✅                                       |
| 月之暗面 | `https://api.moonshot.cn/v1`           | Chat ✅                                       |
| 智谱     | `https://open.bigmodel.cn/api/paas/v4` | Chat ✅                                       |

**使用方式**:

```bash
synapse vault set deepseek sk-xxx --base-url https://api.deepseek.com/v1 --pack openai
synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"Hello"}],"model":"deepseek-chat"}'
```

---

## 6. Schema Lock

协商结果缓存到 `~/.synapse/schemas/`，相同 `intent + provider` 后续调用自动复用。

```bash
# 首次调用 → 创建 Lock
synapse connect deepseek chat --input '{"messages":[...]}'
# Created new lock: chat_deepseek_v1.0.0_xxx

# 后续调用 → 使用缓存
synapse connect deepseek chat --input '{"messages":[...]}'
# Using cached lock: chat_deepseek_v1.0.0_xxx

# 管理 Lock
synapse lock list                    # 列出
synapse lock show <lock-id>          # 详情
synapse lock remove <lock-id>        # 删除（重新协商）
synapse lock migrate <lock-id>       # 迁移到新版本
synapse lock outdated                # 检查过期
```

---

## 7. SDK 生成

```bash
synapse sdk generate --pack openai --lang typescript \
  --provider deepseek --base-url https://api.deepseek.com/v1 \
  --output ./deepseek-sdk
```

生成 6 个文件，零运行时依赖，可直接 npm publish。

---

## 8. 配置文件

```
~/.synapse/
├── keys/               # Vault 加密存储
├── schemas/            # Schema Lock 缓存
├── config.json         # 全局配置
└── providers/          # 用户自定义 Provider
```

### config.json

```json
{
  "providers": {
    "deepseek": {
      "base_url": "https://api.deepseek.com/v1",
      "pack": "openai"
    }
  }
}
```

---

## 9. 开发者本地调试

```bash
cd ~/workspace/qise-tech/synapse-router
pnpm install && pnpm build
pnpm test

# 本地 CLI
pnpm --filter @synapse-router/cli start -- --help

# 全局链接（推荐）
cd apps/cli && pnpm link --global
synapse --help
```

---

## 10. 架构概览

```
synapse-router/
├── packages/
│   ├── core/              # Schema 类型定义
│   ├── negotiator/        # Schema 协商引擎
│   ├── connector/         # 薄连接层（HTTP + 字段映射）
│   ├── lock/              # Schema Lock（缓存/迁移）
│   ├── vault/             # API Key 加密存储
│   ├── sdk-generator/     # SDK 生成
│   ├── pack-generator/    # Pack 自动生成
│   └── router/            # 路由策略
├── apps/
│   ├── cli/               # CLI
│   ├── api/               # HTTP API
│   └── mcp-server/        # MCP Server
└── packs/
    └── openai/            # OpenAI Pack（供兼容厂商复用）
```

---

## 11. 术语表

| 术语              | 含义                                             |
| ----------------- | ------------------------------------------------ |
| **Provider**      | AI 服务提供商（OpenAI、DeepSeek 等）             |
| **Pack**          | Provider 适配包（provider-card + dsl）           |
| **Feature**       | Provider 提供的一项能力                          |
| **Intent**        | Feature 的语义分类（chat、text-to-image 等）     |
| **Field Mapping** | Canonical 字段到 Provider 字段的映射             |
| **Schema Lock**   | 缓存的协商契约（类似 package-lock.json）         |
| **Vault**         | 本地加密 API Key 存储                            |
| **Connector**     | 薄连接层（HTTP 调用 + 字段映射 + base_url 覆盖） |

---

最后更新：2026-04-30
