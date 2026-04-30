# Synapse P1 重新定义 — 基于用户反馈

> **日期**: 2026-04-30
> **触发**: 用户对使用指南的 6 个关键反馈（3 轮对话）
> **状态**: ✅ 决策确认

---

## 0. 决策总结

| # | 问题 | 决策 |
|---|------|------|
| 1 | Registry 访问控制 | P1 仅 @official，无公开注册，无 OAuth |
| 2 | Schema 版本连续性 | Schema Lock 不可变 + 缓存复用 + breaking 不自动升级 |
| 3 | 执行层命名 | `@synapse-router/connector` — 连接 Schema 契约和 Provider API |
| 4 | 执行层设计 | 薄 connector + 多语言 SDK Generator |
| 5 | CLI 交互模式 | 命令式（Agent）+ 交互式（人类）+ Web UI（P2）|
| 6 | 测试 Provider | DeepSeek 优先，OpenAI Pack + base_url 覆盖 |

---

## 1. Registry 访问控制策略

### 三级准入模型

| 层级 | 发布权限 | 浏览权限 | Phase |
|------|---------|---------|-------|
| **@official** | 核心团队后台操作 | 所有人（无需登录） | P1 ✅ |
| **@partner** | 邀请制合作伙伴 | 所有人 | P2 |
| **@community** | 审核制公开 | 所有人 | P3 |

### P1 实现

- **无用户注册入口** — 零运营负担
- **无 OAuth 开发** — 省去 GitHub/Gitee 登录开发量
- **浏览和下载无需登录** — 降低使用门槛
- **发布由核心团队内部操作** — 质量可控

### 安全模型

```
公开端点（无需认证）:
  GET  /api/v1/providers          列出 Provider
  GET  /api/v1/packs              搜索 Pack
  GET  /api/v1/packs/:ns/:name    Pack 详情
  GET  /api/v1/packs/:ns/:name/download  下载 tarball

内部端点（需管理员 Token）:
  POST /api/v1/admin/packs        发布 Pack
  PUT  /api/v1/admin/packs/:id    更新 Pack
  DELETE /api/v1/admin/packs/:id  下架 Pack
```

---

## 2. Schema 版本连续性

### 核心原则

| 原则 | 说明 |
|------|------|
| **Lock 不可变** | 一旦锁定，Schema 不再变化。类似 `package-lock.json` |
| **Lock 可缓存** | 相同 intent + 相同 Pack 版本 → 复用已锁定的 Schema |
| **变更不自动升级** | Pack 更新了？旧 Lock 继续生效，直到用户主动 migrate |
| **Breaking 有迁移路径** | Change Detector 检测 breaking → 生成迁移指南 |

### 生命周期

```
negotiate(intent, provider, pack_version)
  │
  ├── 检查缓存: ~/.synapse/schemas/{intent}_{provider}_{pack_version}.lock.json
  │   ├── 命中 → 直接返回缓存的 Lock（不重新协商）
  │   └── 未命中 → 执行协商 → 生成 Lock → 缓存
  │
  └── Lock 内容:
      {
        "lock_id": "chat_openai_v1",
        "intent": "chat",
        "provider": "openai",
        "pack_version": "2.1.0",
        "locked_at": "2026-04-30T12:00:00Z",
        "input_schema": { ... },
        "output_schema": { ... },
        "field_mappings": [ ... ],
        "connection": {
          "base_url": "https://api.openai.com/v1",
          "auth_type": "Bearer"
        }
      }
```

### Breaking Change 处理

```
Pack 2.1.0 → 3.0.0 (breaking)

1. Change Detector 检测到 breaking change
2. 旧 Lock 继续生效（不自动升级）
3. 用户运行: synapse pack outdated --check-breaking
   → 看到迁移指南
4. 用户决定: synapse migrate chat_openai_v1 --to 3.0.0
   → 生成新 Lock v2，旧 Lock 标记为 deprecated
5. 旧 Lock 在 Pack 版本下线后才失效
```

---

## 3. Connector 包命名与设计

### 命名: `@synapse-router/connector`

**为什么是 connector**：

1. **语义准确** — 它连接两个世界：Schema 契约世界（canonical fields）和 Provider API 世界（provider fields）
2. **与项目隐喻一致** — synapse（突触）本身就是神经元之间的**连接器**
3. **不与现有包冲突** — 项目里没有 connector 概念
4. **用户直觉** — "我要连接 DeepSeek" → `connector.connect(lock, input, connection)`

**排除的候选名称**：

| 候选 | 排除原因 |
|------|---------|
| `execute` | 太重，暗示有策略/引擎 |
| `adapter` | 项目里已有 ProviderAdapter 概念，冲突 |
| `relay` | 暗示中间层，与"减少封装"矛盾 |
| `transport` | 太底层，像网络协议栈 |
| `bridge` | 暗示双向，但调用主要是单向的 |
| `invoke` | 简洁但缺"连接"语义 |

### 架构: 薄 connector + 多语言 SDK Generator

```
                    ┌─────────────────────────┐
                    │   SDK Generator         │
                    │   (从 Pack DSL 生成)     │
                    └────────┬────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        TypeScript      Python          Go
        SDK (原生)      SDK (原生)      SDK (原生)
              │              │              │
              └──────┬───────┘──────────────┘
                     ▼
              ┌──────────────┐
              │ Provider API │  ← 直连，无中间层
              └──────────────┘

同时提供:
              ┌──────────────┐
              │ @synapse-    │  ← 薄连接层（映射+HTTP）
              │ router/      │     适合需要运行时动态
              │ connector    │     协商的场景
              └──────┬───────┘
                     ▼
              ┌──────────────┐
              │ Provider API │
              └──────────────┘
```

### @synapse-router/connector — 薄连接层

**唯一职责**: canonical ↔ provider 字段映射 + HTTP 调用

```typescript
interface ConnectParams {
  lock: LockedSchema;
  input: Record<string, unknown>;   // canonical 字段
  connection: {
    base_url: string;
    api_key: string;
    auth_type: string;
  };
}

interface ConnectResult {
  output: Record<string, unknown>;  // canonical 字段
  raw: unknown;                      // Provider 原始响应
  meta: {
    provider: string;
    model: string;
    usage?: { input_tokens: number; output_tokens: number };
    latency_ms: number;
  };
}

// 使用示例
import { connect } from '@synapse-router/connector';

const result = await connect({
  lock: lockedSchema,
  input: { prompt: "Hello", model: "deepseek-chat" },
  connection: {
    base_url: "https://api.deepseek.com/v1",
    api_key: await vault.getKey("deepseek"),
    auth_type: "Bearer"
  }
});

// result.output — canonical fields
// result.raw    — Provider 原始响应
// result.meta   — usage, latency 等
```

### SDK Generator

从 Pack 的 `provider-card.json` + `dsl/*.json` 直接生成原生代码。

**生成目标**: TS, Python, Go, Java, Rust

**生成原则**:
- 零运行时依赖（生成后不依赖 @synapse-router/*）
- 构造函数接受 `baseUrl` 覆盖（兼容 OpenAI 格式的其他厂商）
- 代码可读，人类可修改
- 类型安全（TS/Go/Rust 有完整类型）

**CLI**:
```bash
synapse sdk generate --pack openai --lang typescript --output ./sdk
synapse sdk generate --pack openai --lang python --output ./sdk
synapse sdk generate --pack openai --lang go --output ./sdk
```

---

## 4. CLI 交互模式 — 三层接入设计

### 核心洞察

同一套能力，两种用户，两种心智模型完全不同：

| 维度 | Agent | 人类 |
|------|-------|------|
| 交互方式 | 命令式，精确参数 | 对话式/引导式，逐步选择 |
| 容错 | 低 — 参数错误直接失败 | 高 — 需要友好的错误提示和重试 |
| 认知负荷 | 低 — 程序生成参数 | 高 — 需要理解每个参数含义 |
| 使用频率 | 高频自动化 | 低频手动操作 |
| 学习方式 | 阅读 help/schema | 试试看/跟着引导走 |

### 三层架构

```
┌──────────────────────────────────────────────────────┐
│                   Web UI (面向人类)          [P2]     │
│  表单填写 / 卡片选择 / 可视化 / 测试调用 / 结果展示    │
│  → 最低认知负荷，最友好                                │
└──────────────────────────────────────────────────────┘
           │ 共用同一套 HTTP API
           ▼
┌──────────────────────┐  ┌──────────────────────────┐
│ CLI 命令式 (Agent)   │  │ CLI 交互式 (人类)         │
│ [P0] 精确参数        │  │ [P1] 引导选择            │
│ synapse vault set    │  │ synapse setup             │
│   deepseek sk-xxx \  │  │   > 选择 Provider: [...]  │
│   --base-url ...     │  │   > 输入 Key: ****        │
│                      │  │   > ✅ 完成!              │
└──────────────────────┘  └──────────────────────────┘
```

### 层1: CLI 命令式（Agent 优先，P0）

Agent 需要的是**精确、无歧义、可脚本化**的接口。

**help 是 Agent 的 API 文档**，必须保留且加强：

| 原则 | 说明 |
|------|------|
| **分层** | `synapse --help` → 概览；`synapse connect --help` → 详细参数 |
| **有示例** | 每个子命令至少一个完整示例 |
| **标注必选/可选** | `<必选>` `[可选]` 明确区分 |
| **机器可解析** | Agent 可以解析 help 输出理解接口 |

```bash
synapse connect --help

Usage: synapse connect <provider> <intent> [options]

Connect to a provider and execute a feature call.

Arguments:
  <provider>    Provider ID (e.g. deepseek, openai)
  <intent>      Feature intent (e.g. chat, text-to-image, embeddings)

Options:
  --input <json>        Input as JSON string (canonical fields)
  --input-file <path>   Read input from JSON file
  --base-url <url>      Override provider base URL
  --api-key ***       Override API key (prefer vault)
  --lock <path>         Use existing schema lock file
  --raw                 Output raw provider response
  --format <fmt>        Output format: json | table | compact (default: json)

Examples:
  synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"Hello"}],"model":"deepseek-chat"}'
  synapse connect openai text-to-image --input '{"prompt":"a cat","size":"1024x1024"}' --base-url https://api.deepseek.com/v1
```

### 层2: CLI 交互式（人类友好，P1）

给人类提供的**引导式入口**，不需要记忆任何参数。

**关键机制**: 缺少必要参数时，自动降级为交互式：

```bash
# 有完整参数 → 命令式（无交互）
synapse connect deepseek chat --input '{"messages":...}'

# 缺少参数 → 自动降级为交互式
synapse connect deepseek chat
# → 检测到缺少 --input，进入交互式输入
```

**引导式配置**:

```bash
$ synapse setup

🎯 Synapse Router Setup

Step 1: Choose a provider
  ❯ DeepSeek
    OpenAI
    Moonshot (月之暗面)
    More...

Step 2: Enter your API key
  API Key: ****

Step 3: Configure base URL
  Base URL [https://api.deepseek.com/v1]: ↵  ← 默认值，回车确认

Step 4: Select pack
  ❯ openai (compatible with DeepSeek)
    Generate new pack from OpenAPI spec

✅ DeepSeek configured!
   Pack: openai
   Base URL: https://api.deepseek.com/v1

Next: synapse connect deepseek chat
```

**引导式调用**:

```bash
$ synapse connect

🎯 Connect to Provider

Step 1: Choose provider
  ❯ deepseek  ✅ key configured
    openai    ✅ key configured
    stability ❌ no key

Step 2: Choose feature
  ❯ Chat Completions (chat)
    Embeddings (embeddings)
    Image Generations (text-to-image)

Step 3: Enter input
  Messages (or type for interactive chat): Hello, who are you?
  Model [deepseek-chat]: ↵

✅ Connected!
   Provider: deepseek
   Model: deepseek-chat
   Usage: 15 input + 42 output tokens
   Latency: 1.2s

   Response:
   Hello! I'm DeepSeek Chat...
```

### 层3: Web UI（人类最友好，P2）

```
Web UI 核心页面:

/                    → Provider 卡片选择页
/provider/:id        → Provider 详情 + Feature 列表
/connect/:id/:intent → 表单化调用（输入字段表单，输出结果展示）
/vault               → Key 管理（CRUD + 格式验证）
/locks               → Schema Lock 列表 + 版本管理
/sdk                 → SDK 生成（选 Provider → 选语言 → 下载）
```

Web UI 和 CLI 共用**同一套 HTTP API**：

```
CLI (命令式)  ──┐
                ├──▶ 同一套 API ──▶ @synapse-router/connector
CLI (交互式)  ──┤
                │
Web UI        ──┘
```

### 三层对比

| 维度 | CLI 命令式 | CLI 交互式 | Web UI |
|------|-----------|-----------|--------|
| 面向 | Agent | 人类 | 人类 |
| 参数方式 | 全部参数化 | 引导选择 | 表单+卡片 |
| 输出格式 | JSON（机器解析） | 格式化文本 | 可视化 |
| 帮助方式 | `--help` | 内嵌提示 | Tooltip + 文档链接 |
| 实现优先级 | **P0** | **P1** | P2 |
| 实现成本 | 低 | 中 | 高 |

### CLI 命令更新汇总

```bash
# 旧命令                → 新命令
synapse execute          → synapse connect        # 连接 Provider 调用
synapse vault set        → synapse vault set      # 不变
(新增)                   → synapse setup           # 引导式配置（人类）
(新增)                   → synapse connect (无参数) # 引导式调用（人类）
synapse --help           → synapse --help          # 加强：分层+示例
```

---

## 5. DeepSeek 作为首个测试 Provider

### 为什么是 DeepSeek

- 用户有 DeepSeek API key，可立即测试
- DeepSeek 完全兼容 OpenAI Chat API 格式
- 验证 base_url 覆盖机制的最佳场景
- DeepSeek 有独特能力（deepseek-reasoner），未来可独立 Pack

### 实现路径

**Phase 1**: OpenAI Pack + base_url 运行时覆盖

```bash
# 用户配置
synapse vault set deepseek sk-deepseek-xxx --base-url https://api.deepseek.com/v1 --pack openai

# 连接调用
synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"Hello"}],"model":"deepseek-chat"}'
```

**Phase 2**: 独立 DeepSeek Pack（当需要 deepseek-reasoner 等独有 Feature 时）

---

## 6. P1 优先级重排

```
旧优先级:
  1. 修复测试
  2. 文档
  3. 执行引擎（OpenAI）

新优先级:
  P0: @synapse-router/connector 薄连接层
  P0: base_url 运行时覆盖 + DeepSeek 测试
  P0: 端到端验证: negotiate → lock → connect → 真实 API 返回
  P0: CLI 命令式 connect 命令（Agent 用）+ 加强版 help
  P1: Schema Lock 实现（版本连续性）
  P1: CLI 交互式模式（synapse setup + 缺参数自动降级）
  P1: SDK Generator MVP（先 TS）
  P1: Registry @official 准入（无公开注册）
  P2: Python SDK 生成
  P2: Registry 前端 MVP
  P2: Web UI
  P3: Go/Java/Rust SDK 生成
  P3: @partner 邀请制
```

---

最后更新：2026-04-30
