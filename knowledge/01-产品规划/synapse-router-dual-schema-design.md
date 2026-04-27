# 双 Schema 契约设计（v2 — 确认决策 + Agent Protocol 整合）

> Agent 自定义 Schema + 服务端锁定 Schema，集成 Agent Protocol，实现 Provider 可变、契约不变

---

## 0. 确认的产品决策

| # | 决策点 | 确认结果 |
|---|--------|----------|
| 1 | Schema 存储 | **文件系统** — 每个 Agent 一个目录，Schema 文件 + 锁文件 |
| 2 | Agent 自由度 | **受限于已有 Provider 能力** — Agent 只能在服务端已注册的 Provider 能力范围内定义 Schema |
| 3 | 字段映射 | **服务端专用 Agent（小模型）自动生成** — Provider 接入时自动生成 DSL 文档，消费 Agent 与服务 Agent 协商获取可用字段/DSL/Feature |
| 4 | 变更通知 | **Webhook 优先**，降级为轮询 API |
| 5 | Schema 过期 | **有过期机制**，与 API Key 挂钩，支持多档次过期时间 |
| 6 | Agent Protocol 整合 | **复用 Agent Protocol 基础层 + 扩展 Schema 协商层** |

---

## 1. 核心架构：三角色模型

```
┌──────────────┐     ┌───────────────────┐     ┌──────────────┐
│  Consumer    │     │  Schema Registry  │     │  Provider    │
│  Agent       │────>│  Agent (服务端)    │<────│  Adapter     │
│              │     │  (小模型驱动)      │     │              │
│ 持有:        │     │                   │     │ 持有:        │
│ AgentSchema  │     │ 持有:             │     │ ProviderSpec │
│ schema_id    │     │ ServerSchema      │     │ ProviderDSL  │
│              │     │ ProviderRegistry  │     │              │
└──────────────┘     │ FieldMappingLib   │     └──────────────┘
                     └───────────────────┘
```

### 三角色职责

| 角色 | 身份 | 核心职责 |
|------|------|----------|
| **Consumer Agent** | 消费方 AI Agent | 用 DSL 声明需要什么功能/字段，持有自己的 AgentSchema + 服务端返回的 schema_id |
| **Schema Registry Agent** | 服务端专用 Agent（小模型） | 接收 Provider → 自动生成 DSL 文档；接收消费 Agent → 协商并锁定 Schema；变更时通知 |
| **Provider Adapter** | 图片接口提供方 | 封装各异 Provider API，声明能力（Spec），执行标准化请求 |

---

## 2. 两种 Schema 详解

### 2.1 Agent Schema（Consumer Agent 持有）

> "我需要什么" — 基于 Agent Protocol Agent Card 扩展

```ts
type AgentSchema = {
  // ===== 来自 Agent Protocol Foundation Layer =====
  agent_id: string;                    // Agent 唯一标识
  agent_name: string;                  // 可读名称
  version: string;                     // Agent 版本

  // ===== 扩展：接入协议 =====
  access_protocol: AccessProtocol;     // 接入方式

  // ===== 扩展：功能声明 =====
  features: AgentFeature[];            // 我需要的功能列表
  global_policy?: AgentGlobalPolicy;   // 全局策略偏好
};

type AccessProtocol =
  | { kind: "api";    endpoint?: string; auth_type: "APIKey" | "Bearer" | "OAuth2" }
  | { kind: "mcp";    server_url: string; tools?: string[] }
  | { kind: "cli";    command: string; args?: string[] }
  | { kind: "a2a";    agent_url: string; skill?: string };

type AgentFeature = {
  feature_id: string;                  // 功能唯一标识（Agent 定义）
  feature_name: string;
  intent: string;                      // 如 "text-to-image", "image-to-image"

  // Agent 视角的输入输出
  input_schema: Schema;                // Agent 描述自己会传什么
  output_schema: Schema;               // Agent 期望收什么

  // 字段处理规则（Agent 视角的理解）
  field_mappings?: FieldMapping[];     // Agent 如何理解 Provider 返回的字段

  // 能力约束
  capabilities: CapabilityRequirement[];

  // 策略偏好
  policy?: FeaturePolicy;
};

type FieldMapping = {
  provider_field: string;              // Provider 原始字段路径（如 "data[0].url"）
  agent_field: string;                 // Agent 映射后的字段名（如 "image_url"）
  transform?: "passthrough" | "extract_url" | "base64_decode" | "json_parse" | "cast_number";
  required: boolean;
  fallback?: unknown;
};

type CapabilityRequirement =
  | { kind: "structured-output"; strict: boolean }
  | { kind: "tool-calling"; tools: string[] }
  | { kind: "vision-input" }
  | { kind: "streaming"; required: boolean }
  | { kind: "image-generation"; modalities: string[] }
  | { kind: "controlnet"; types: string[] };

type AgentGlobalPolicy = {
  preferred_strategy?: "cheap" | "fast" | "quality";
  max_cost_per_request?: number;
  max_latency_ms?: number;
  allowed_providers?: string[];
  blocked_providers?: string[];
};

type FeaturePolicy = {
  preferred_provider?: string;
  allow_fallback?: boolean;
  allow_schema_adaptation?: boolean;
  version_lock?: boolean;
};
```

### 2.2 Server Schema（服务端持有 — 锁定文件）

> "我承诺提供什么" — 类似 package-lock.json

```ts
type ServerSchema = {
  agent_id: string;
  schema_version: string;              // 语义化版本
  created_at: string;
  updated_at: string;

  // 锁定的功能
  locked_features: LockedFeature[];

  // 锁定的 Provider 依赖
  locked_providers: LockedProvider[];

  // 锁定的 API Key 和过期
  api_key: LockedApiKey;
};

type LockedFeature = {
  feature_id: string;
  feature_name: string;

  // 锁定的 Provider 绑定
  primary_provider: ProviderBinding;
  fallback_provider?: ProviderBinding;

  // 锁定的 Schema
  locked_input_schema: Schema;
  locked_output_schema: Schema;

  // 锁定的字段映射
  locked_field_mappings: LockedFieldMapping[];

  // 锁定的能力
  locked_capabilities: CapabilityRequirement[];

  // 协商元数据
  negotiation_result: NegotiationResult;
  negotiated_at: string;
};

type ProviderBinding = {
  provider_name: string;
  provider_adapter_version: string;     // Adapter 代码版本
  provider_api_version: string;        // Provider 接口版本
};

type LockedFieldMapping = {
  provider_field: string;
  agent_field: string;
  transform: string;
  required: boolean;
  fallback?: unknown;
  verified_at: string;
};

type LockedProvider = {
  provider_name: string;
  provider_adapter_version: string;
  provider_api_version: string;
  dependent_features: string[];        // 哪些 feature 依赖此 Provider
  last_health_check?: string;
  breaking_changes_pending?: BreakingChange[];
};

type BreakingChange = {
  change_id: string;
  description: string;
  affected_features: string[];
  planned_at: string;
  severity: "compatible" | "deprecated" | "breaking";
  migration_guide?: string;
};

type NegotiationResult =
  | { status: "accepted"; contract: LockedFeature }
  | { status: "adapted"; contract: LockedFeature; changes: string[] }
  | { status: "rejected"; reasons: string[] };
```

---

## 3. API Key 过期机制

### 3.1 过期档次

| 档次 | 有效期 | 适用场景 | Schema 策略 |
|------|--------|----------|-------------|
| `trial` | 7 天 | 试用/测试 | 自动过期，不保留锁定 |
| `short` | 30 天 | 短期项目 | 过期前 7 天通知，过期后锁定失效 |
| `standard` | 90 天 | 正式项目 | 过期前 14 天通知，过期后 30 天 grace period |
| `long` | 365 天 | 长期产品 | 过期前 30 天通知，过期后 90 天 grace period |
| `perpetual` | 永不过期 | 核心集成 | 无过期，但每 180 天需确认活跃 |

### 3.2 过期与 Schema 锁定的关系

```ts
type LockedApiKey = {
  key_id: string;
  tier: "trial" | "short" | "standard" | "long" | "perpetual";
  issued_at: string;
  expires_at: string | null;           // null = perpetual
  grace_period_ends_at: string | null; // 过期后的宽限期
  status: "active" | "expiring_soon" | "grace_period" | "expired";

  // Webhook 通知配置
  webhook_url?: string;
  webhook_events: ApiKeyWebhookEvent[];
};

type ApiKeyWebhookEvent =
  | { type: "key.expiring_soon"; data: { days_remaining: number } }
  | { type: "key.grace_period_started"; data: { grace_ends_at: string } }
  | { type: "key.expired"; data: { schema_retention_days: number } }
  | { type: "schema.breaking_change"; data: BreakingChange }
  | { type: "schema.deprecated"; data: { feature_id: string; sunset_date: string } };
```

---

## 4. Schema Registry Agent（服务端专用 Agent）

### 4.1 定位

Schema Registry Agent 是服务端运行的一个**专用小模型 Agent**，职责是：

1. **Provider 接入时** → 自动分析 Provider API，生成 DSL 文档
2. **Consumer Agent 接入时** → 协商 Schema，生成字段映射，锁定契约
3. **变更时** → 影响分析，通知受影响的 Agent

### 4.2 作为 Agent Protocol 的 Agent Card

Schema Registry Agent 本身也是一个 Agent Protocol Agent，拥有自己的 Agent Card：

```json
{
  "agent": {
    "id": "synapse-schema-registry",
    "name": "Synapse Schema Registry",
    "version": "1.0.0",
    "description": "Schema negotiation and Provider capability registry for Synapse Router"
  },
  "capabilities": [
    {
      "id": "schema.query",
      "name": "Query Available Schemas",
      "description": "查询可用的 Provider、Feature、字段和 DSL",
      "granularity": "fine-grained",
      "intents": ["query-providers", "query-features", "query-fields"],
      "input": { "type": "structured", "schema": "synapse://schemas/query-input" },
      "output": { "type": "structured", "schema": "synapse://schemas/query-output" }
    },
    {
      "id": "schema.negotiate",
      "name": "Negotiate Schema",
      "description": "提交 Agent Schema，协商兼容性，生成锁定",
      "granularity": "fine-grained",
      "intents": ["register-agent", "negotiate-feature", "lock-schema"],
      "input": { "type": "structured", "schema": "synapse://schemas/negotiate-input" },
      "output": { "type": "structured", "schema": "synapse://schemas/negotiate-output" }
    },
    {
      "id": "schema.update",
      "name": "Update Schema",
      "description": "更新已有的 Schema 锁定，处理变更通知",
      "granularity": "fine-grained",
      "intents": ["update-schema", "migrate-feature", "check-compatibility"],
      "input": { "type": "structured", "schema": "synapse://schemas/update-input" },
      "output": { "type": "structured", "schema": "synapse://schemas/update-output" }
    },
    {
      "id": "provider.register",
      "name": "Register Provider",
      "description": "注册新的 Provider，自动生成 DSL 文档",
      "granularity": "fine-grained",
      "intents": ["register-provider", "update-provider-spec"],
      "input": { "type": "structured", "schema": "synapse://schemas/provider-register-input" },
      "output": { "type": "structured", "schema": "synapse://schemas/provider-register-output" }
    }
  ],
  "endpoints": {
    "http": { "url": "https://api.synapse.router/v1", "protocol": "REST" },
    "mcp": { "type": "http", "command": "synapse-registry" },
    "a2a": { "agent_url": "https://api.synapse.router/a2a" }
  }
}
```

### 4.3 协商交互流程

Consumer Agent 通过 Agent Protocol 与 Schema Registry Agent 交互：

```
Consumer Agent                          Schema Registry Agent
    │                                          │
    │ 1. query: 有哪些 Feature 可用？           │
    │ ────────────────────────────────────────> │
    │                                          │
    │ 2. 返回: Provider 列表 + Feature 列表     │
    │     + 每个 Feature 的字段和 DSL           │
    │ <──────────────────────────────────────── │
    │                                          │
    │ 3. negotiate: 提交 AgentSchema            │
    │    (我需要 text-to-image,                 │
    │     输入 prompt/size, 输出 image_url)     │
    │ ────────────────────────────────────────> │
    │                                          │
    │    [内部: 小模型分析 AgentSchema]          │
    │    [匹配 Provider 能力]                   │
    │    [生成字段映射]                         │
    │    [计算锁定版本]                         │
    │                                          │
    │ 4. 返回: 协商结果 + ServerSchema           │
    │    + schema_id + api_key                  │
    │ <──────────────────────────────────────── │
    │                                          │
    │ 5. 确认: 接受协商结果                     │
    │ ────────────────────────────────────────> │
    │                                          │
    │    [锁定 ServerSchema 到文件系统]          │
    │                                          │
    │ 6. schema_id 已激活                       │
    │ <──────────────────────────────────────── │
```

### 4.4 文件系统存储结构

```
.synapse/
├── providers/                        # Provider 注册
│   ├── openai/
│   │   ├── spec.json                 # ProviderSpec
│   │   ├── dsl.json                  # 自动生成的 DSL 文档
│   │   └── adapter.json              # Adapter 版本和配置
│   ├── comfyui/
│   │   ├── spec.json
│   │   ├── dsl.json
│   │   └── adapter.json
│   └── replicate/
│       ├── spec.json
│       ├── dsl.json
│       └── adapter.json
│
├── agents/                           # Agent 锁定
│   ├── agent-abc-123/
│   │   ├── agent-schema.json         # Agent 提交的 AgentSchema
│   │   ├── server-schema.json        # 服务端生成的 ServerSchema（锁定）
│   │   ├── api-key.json              # API Key + 过期信息
│   │   └── mappings/
│   │       ├── text-to-image.json    # 字段映射详情
│   │       └── image-to-image.json
│   └── agent-xyz-789/
│       ├── agent-schema.json
│       ├── server-schema.json
│       ├── api-key.json
│       └── mappings/
│           └── avatar-gen.json
│
└── registry.json                     # 全局注册表（谁依赖什么）
```

---

## 5. 变更安全机制

### 5.1 变更分类

| 级别 | 定义 | 处理 |
|------|------|------|
| **compatible** | 新增可选字段、新增 Provider、放宽约束 | 直接上线，已锁定 Schema 不受影响 |
| **deprecated** | 字段标记弃用但仍可用、Provider 版本标记旧版 | Webhook 通知，按 API Key 档次设置迁移窗口 |
| **breaking** | 删除字段、改变类型、Provider 下线 | 旧版继续给已锁定 Agent 服务，Agent 主动升级才切换 |

### 5.2 Webhook 通知（优先），降级为轮询

```ts
type WebhookDelivery = {
  event: ApiKeyWebhookEvent;
  target_url: string;
  attempts: number;
  max_attempts: number;                // 默认 3 次
  next_attempt_at: string;
  last_response_status?: number;
};

// 轮询降级：如果 Webhook 连续 3 次失败，Agent 可通过 GET /notifications 轮询
type PollingNotification = {
  agent_id: string;
  unread_events: ApiKeyWebhookEvent[];
  last_polled_at: string;
};
```

---

## 6. Agent Protocol 整合分析

### 6.1 可直接复用的层

| Agent Protocol 层 | Synapse Router 用途 | 复用程度 |
|-------------------|---------------------|----------|
| **Foundation Layer** | Agent 身份（agent_id, name, version, discovery） | ✅ 完全复用 |
| **Capability Layer** | Capability → Feature 映射，Intent 匹配 | ✅ 复用核心，扩展 Schema 维度 |
| **Trust Layer** | API Key 认证 + 过期管理 | ⚠️ 复用基础，需扩展过期档次 |
| **Protocol Layer** | HTTP/MCP/CLI/A2A 传输绑定 | ✅ 完全复用 |
| **Action Layer** | Schema Registry Agent 的意图识别和路由 | ✅ 复用 Action Router |
| **Application Layer** | Tool/Payment 集成 | ⚠️ 部分复用（Tool） |

### 6.2 需要新增到 Agent Protocol 的能力

| 新能力 | 说明 | 建议版本 |
|--------|------|----------|
| **Schema Negotiation** | Agent 间协商输入输出 Schema 的标准协议 | v0.4 |
| **Schema Versioning & Locking** | Schema 版本锁定和兼容性保障 | v0.4 |
| **Provider Registry** | Provider 能力注册和发现（区别于 Agent Capability） | v0.4 |
| **Field Mapping** | 字段映射规则声明和转换 | v0.4 |
| **API Key Lifecycle** | API Key 过期档次、续期、Webhook 通知 | v0.4 |
| **Breaking Change Protection** | 变更影响分析和保护机制 | v0.4 |

### 6.3 对 Agent Protocol 现有结构的调整建议

#### 调整 1：Capability 扩展 Schema 维度

**现有**（v0.3）：
```json
{
  "capabilities": [{
    "id": "image.generate",
    "intents": ["product-photo"],
    "input": { "type": "intent", "schema": "https://..." },
    "output": { "type": "structured", "schema": "https://..." }
  }]
}
```

**建议 v0.4**：
```json
{
  "capabilities": [{
    "id": "image.generate",
    "intents": ["product-photo"],
    "input": { "type": "structured", "schema": "https://...", "version": "1.2.0" },
    "output": { "type": "structured", "schema": "https://...", "version": "1.2.0" },
    "schema_lock": {
      "locked": true,
      "lock_version": "1.0.0",
      "locked_at": "2026-04-27T00:00:00Z"
    },
    "field_mappings": [
      { "provider_field": "data.url", "agent_field": "image_url", "transform": "extract_url" }
    ]
  }]
}
```

#### 调整 2：Trust 层增加 API Key 生命周期

**现有**（v0.3）：
```json
{
  "trust": {
    "auth": { "type": "APIKey", "required": true }
  }
}
```

**建议 v0.4**：
```json
{
  "trust": {
    "auth": {
      "type": "APIKey",
      "required": true,
      "lifecycle": {
        "tiers": ["trial", "short", "standard", "long", "perpetual"],
        "default_tier": "standard",
        "webhook_support": true,
        "polling_fallback": true
      }
    }
  }
}
```

#### 调整 3：新增 Schema Negotiation 消息类型

**现有**（v0.3 Protocol Layer）：
```ts
type MessageType =
  | 'action_request'
  | 'action_response'
  | 'skill_invoke'
  | 'capability_query'
  | 'encrypted_memory_sync'
  | 'memory_access_request';
```

**建议 v0.4**：
```ts
type MessageType =
  | ...existing
  | 'schema_query'              // 查询可用 Schema/Feature
  | 'schema_negotiate'          // 提交 Agent Schema 协商
  | 'schema_lock'               // 锁定 Schema
  | 'schema_update'             // 更新/迁移 Schema
  | 'schema_breaking_change';   // 破坏变更通知
```

#### 调整 4：新增 Provider Card（区别于 Agent Card）

Provider 不同于 Agent，它不需要 Action Layer 或 Skill Layer，但需要精确的能力描述和版本信息：

```json
{
  "$schema": "https://usee.art/schemas/provider-card-v0.4.json",
  "provider": {
    "id": "openai-dall-e",
    "name": "OpenAI DALL-E",
    "version": "1.2.0",
    "api_version": "2024-02-01",
    "description": "OpenAI image generation API"
  },
  "capabilities": [{
    "id": "image.generate.text-to-image",
    "intents": ["text-to-image"],
    "input": { "schema": "synapse://providers/openai/schemas/generate-input", "version": "1.2.0" },
    "output": { "schema": "synapse://providers/openai/schemas/generate-output", "version": "1.2.0" },
    "field_mappings": [
      { "provider_field": "data[0].url", "canonical_field": "image_url", "transform": "extract_url" },
      { "provider_field": "data[0].b64_json", "canonical_field": "image_base64", "transform": "passthrough" }
    ]
  }],
  "trust": {
    "auth": { "type": "Bearer" },
    "rateLimit": { "requestsPerMinute": 60 }
  }
}
```

---

## 7. 演进路径

### Phase 1：双 Schema 类型 + 文件存储（2周）
- 定义 AgentSchema / ServerSchema TypeScript 类型
- 文件系统存储结构实现
- 基础的 AgentSchema 提交和 ServerSchema 生成

### Phase 2：Schema Registry Agent（3周）
- 小模型驱动的 Provider DSL 自动生成
- Consumer Agent 与 Schema Registry Agent 的协商协议
- 字段映射自动生成
- Schema 锁定机制

### Phase 3：API Key + 过期 + 通知（2周）
- API Key 五档过期实现
- Webhook 通知 + 轮询降级
- 过期与 Schema 锁定联动

### Phase 4：变更安全机制（2周）
- 变更分类（compatible/deprecated/breaking）
- 影响分析：谁依赖了什么
- 旧版 Schema 继续服务
- 破坏变更通知和迁移

### Phase 5：多协议接入（3周）
- API 接入（Fastify HTTP）
- MCP 接入（MCP Server 桥接）
- CLI 接入（子进程调用）
- A2A 接入（协议握手）

### Phase 6：Agent Protocol v0.4 更新（并行）
- Schema Negotiation 消息类型
- Provider Card 规范
- Capability 扩展 Schema 维度
- Trust 层 API Key 生命周期
- 写入 v0.4-draft 规范

---

## 8. 两个项目的关系定义

```
Agent Protocol (v0.4)           Synapse Router
═══════════════════           ═══════════════
协议标准层                      产品实现层

定义:                          实现:
- Schema Negotiation 消息格式   - Schema Registry Agent (小模型)
- Provider Card 规范           - Provider Adapter (OpenAI/ComfyUI/...)
- Capability Schema 扩展       - 双 Schema 存储和锁定
- API Key Lifecycle 规范       - 文件系统存储
- Breaking Change 保护规范     - Webhook + 轮询通知

依赖关系:
- Synapse Router 遵循 Agent Protocol v0.4 规范
- Agent Protocol v0.4 从 Synapse Router 需求中提炼标准
```

---

最后更新：2026-04-27
