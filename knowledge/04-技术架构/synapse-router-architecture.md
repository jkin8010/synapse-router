# 架构

Synapse Router 拆分为多个小包，让 Schema 契约、协商、Provider Adapter、连接层和 Lock 机制可以独立演进。

**版本**: 0.1.0 | **最后更新**: 2026-04-30

## Packages

| 包名 | 职责 | 状态 |
|------|------|------|
| `@synapse-router/core` | 共享类型定义、Schema 校验、结果/错误形态 | ✅ 稳定 |
| `@synapse-router/negotiator` | Schema 协商引擎（Intent 匹配 + 能力验证） | ✅ 稳定 |
| `@synapse-router/providers` | Provider Registry + Adapter 接口 + 能力元数据 | ✅ 稳定 |
| `@synapse-router/router` | 路由策略（cheap/fast/quality）+ 执行交接 | ✅ 稳定 |
| `@synapse-router/connector` | **薄连接层**：HTTP 调用 + 字段映射 + base_url 运行时覆盖 | ✅ Phase 1 新增 |
| `@synapse-router/lock` | **Schema Lock**：协商结果缓存、存储、迁移、过期检测 | ✅ Phase 1 新增 |
| `@synapse-router/vault` | API Key 加密存储（AES-256-GCM + OS Keychain） | ✅ 稳定 |
| `@synapse-router/pack-generator` | 从 OpenAPI Spec 自动生成 Provider Pack | ✅ 稳定 |
| `@synapse-router/sdk-generator` | 从 Pack DSL 生成 TypeScript / Python SDK | ✅ Phase 1 新增 |

## Apps

| 应用 | 职责 | 状态 |
|------|------|------|
| `@synapse-router/cli` | CLI 工具（connect/setup/config/vault/lock/sdk 等） | ✅ Phase 1 大幅更新 |
| `@synapse-router/api` | HTTP API Server（/connect, /negotiate, /vault） | ✅ |
| `@synapse-router/mcp-server` | MCP Server（Model Context Protocol） | ⚠️ 基础框架 |
| `@synapse-router/playground` | 本地可视化调试界面 | ⚠️ 待完善 |

## 请求流程

```
Agent / CLI / HTTP API
        │
        │ AgentSchema（需求声明）或 connect 直调
        ▼
┌─────────────────────────────────────┐
│          Synapse Router             │
│                                     │
│  ┌─────────────┐  ┌──────────────┐ │
│  │ Negotiator  │  │    Lock      │ │
│  │ 协商匹配     │  │ 缓存/复用    │ │
│  └──────┬──────┘  └──────┬───────┘ │
│         │                │          │
│         └────┬───────────┘          │
│              ▼                      │
│  ┌──────────────────────────┐       │
│  │      Connector           │       │
│  │  • base_url 运行时覆盖    │       │
│  │  • 字段映射 + transform   │       │
│  │  • canonical ↔ provider  │       │
│  └──────────┬───────────────┘       │
│             ▼                       │
│  ┌──────────────────────────┐       │
│  │      Vault               │       │
│  │  • API Key 获取          │       │
│  │  • 加密存储              │       │
│  └──────────────────────────┘       │
└─────────────────────────────────────┘
        │
        │ HTTP 请求（Provider API）
        ▼
   OpenAI / DeepSeek / ...
```

1. 调用方提交 AgentSchema 或直接 `connect` 调用
2. 如果是 `connect`：优先检查 Schema Lock 缓存
3. 如果有缓存：复用已锁定的 Schema
4. 如果无缓存：Negotiator 协商匹配 Provider 能力，生成并缓存 Schema Lock
5. Connector 构建请求：字段映射 + base_url 覆盖
6. Vault 提供 API Key
7. HTTP 请求发送至 Provider API
8. Connector 标准化响应返回

## 边界规则

- Provider Adapter 可以翻译 Provider 私有请求与响应格式
- Core 类型不导入任何 Provider SDK 类型
- Connector 是**薄连接层**：不处理业务逻辑，只做 HTTP 调用 + 字段转换
- Lock 是**只读契约**：一旦锁定，不随 Pack 更新自动变化
- Vault 加密 Key 永不明文落盘（内存解密 + 写回即焚）

## 数据流

### connect 命令数据流

```
CLI: synapse connect deepseek chat --input '{"messages":...}'
  │
  ├─ 1. 加载 config → 获取 pack 映射（deepseek → openai）
  │
  ├─ 2. 加载 Provider Card（packs/openai/provider-card.json）
  │
  ├─ 3. 检查 Schema Lock 缓存（~/.synapse/schemas/）
  │     └─ 无缓存 → 构建 Lock → 缓存
  │
  ├─ 4. Vault 获取 API Key
  │
  ├─ 5. Connector 构建请求：
  │     ├─ base_url = config 覆盖（https://api.deepseek.com/v1）
  │     ├─ auth = Bearer + API Key
  │     ├─ URL = base_url + deriveApiPath(feature_id)
  │     └─ body = mapInput(canonical → provider) + 透传
  │
  ├─ 6. HTTP POST → Provider API
  │
  └─ 7. Connector 标准化响应：
        ├─ output = 标准化字段
        ├─ raw = Provider 原始响应
        └─ meta = 元数据（latency, usage, model）
```

### SDK 生成数据流

```
Pack DSL (provider-card.json + dsl/*.json)
  │
  ├─ 1. 读取 Provider Card
  │
  ├─ 2. 读取 DSL 文件
  │
  ├─ 3. 生成 types.ts（DSL input/output → TypeScript interface）
  │
  ├─ 4. 生成 client.ts（feature_id → camelCase method + fetch 调用）
  │
  ├─ 5. 生成 index.ts + package.json + README.md + tsconfig.json
  │
  └─ 6. 输出到 --output 目录
```

---

## 关键设计决策

### 为什么 Connector 是薄连接层？

- 不在 connector 中实现 Provider 特定逻辑（那是 Adapter 的职责）
- 只做三件事：HTTP 请求 + 字段映射 + base_url 覆盖
- 让 Provider 特定代码只存在于 Provider Adapter 中

### 为什么需要 Schema Lock？

- 避免每次 `connect` 都重新协商
- 确保契约版本连续（类似 `package-lock.json`）
- Pack 更新时不自动升级，用户可控制迁移时机

### 为什么 SDK 零依赖？

- 生成的 SDK 不依赖 `@synapse-router/*` 任何包
- 只使用 `fetch`（浏览器 / Node 18+ 内置）
- 可直接 npm publish，无需安装 Router

---

最后更新：2026-04-30
