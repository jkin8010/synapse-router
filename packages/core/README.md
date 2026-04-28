# @synapse-router/core

Schema 类型体系、校验与规范化。所有其他包的基础依赖。

## 安装

```bash
npm install @synapse-router/core
```

## Schema 类型体系

### 基础 Schema

```typescript
import { type Schema, type Field, type DSLType } from "@synapse-router/core";

// 5 种字段类型
type DSLType = "string" | "number" | "boolean" | "enum" | "image";

// 字段定义
interface Field {
  name: string;
  type: DSLType;
  required?: boolean;
  enumValues?: string[];  // 仅 enum 类型
  fields?: Field[];       // 嵌套字段（最大深度 2）
}

// Schema 定义
interface Schema {
  name: string;
  version?: string;
  fields: Field[];
}
```

### AgentSchema — Agent 需求声明

Agent 持有的 Schema，声明"我需要什么"（类似 `package.json`）。

```typescript
import type {
  AgentSchema,
  AgentFeature,
  AgentFieldMapping,
  AccessProtocol,
  CapabilityRequirement,
  FeaturePolicy,
  AgentGlobalPolicy,
} from "@synapse-router/core";

const agentSchema: AgentSchema = {
  agent_id: "my-image-agent",
  agent_name: "Image Generator Agent",
  version: "1.0.0",

  // 接入方式：4 种协议
  access_protocol: {
    kind: "api",
    auth_type: "Bearer",
  },

  // 功能列表
  features: [
    {
      feature_id: "gen-image",
      feature_name: "Generate Image",
      intent: "text-to-image",

      input_schema: {
        name: "image_input",
        fields: [
          { name: "prompt", type: "string", required: true },
          { name: "width", type: "number" },
          { name: "height", type: "number" },
        ],
      },
      output_schema: {
        name: "image_output",
        fields: [
          { name: "image_url", type: "string" },
        ],
      },

      // 字段映射：Provider 字段 ↔ Agent 语义字段
      field_mappings: [
        {
          provider_field: "text_prompts",
          canonical_field: "prompt",
          agent_field: "prompt",
          transform: "passthrough",
          required: true,
        },
      ],

      // 能力需求
      capabilities: [
        { kind: "image-generation", modalities: ["png", "jpeg"] },
      ],

      // 策略偏好
      policy: {
        preferred_provider: "stability",
        allow_fallback: true,
      },
    },
  ],

  // 全局策略
  global_policy: {
    preferred_strategy: "quality",
    max_cost_per_request: 0.05,
    max_latency_ms: 30000,
    allowed_providers: ["openai", "stability", "replicate"],
  },
};
```

### ServerSchema — 服务端锁定契约

Router 协商后生成的锁定文件，声明"我承诺提供什么"（类似 `package-lock.json`）。

```typescript
import type {
  ServerSchema,
  LockedFeature,
  LockedFeatureSummary,
  LockedProvider,
  LockedApiKey,
  NegotiationResult,
} from "@synapse-router/core";
```

**LockedFeatureSummary** 是锁定功能的核心摘要，打破循环引用：

```typescript
interface LockedFeatureSummary {
  feature_id: string;
  feature_name: string;
  primary_provider: ProviderBinding;
  fallback_provider?: ProviderBinding;
  locked_input_schema: Schema;
  locked_output_schema: Schema;
  locked_field_mappings: LockedFieldMapping[];
  locked_capabilities: CapabilityRequirement[];
  negotiated_at: string;
}
```

**NegotiationResult** 描述协商结果的三种状态：

```typescript
type NegotiationResult =
  | { status: "accepted"; contract: LockedFeatureSummary }          // 完全匹配
  | { status: "adapted"; contract: LockedFeatureSummary; changes: string[] }  // 需适配
  | { status: "rejected"; reasons: string[] };                      // 拒绝
```

## Field Mapping & Transform

字段映射是 Provider 原始字段与 Agent 语义字段之间的桥梁。

### FieldMapping

```typescript
interface FieldMapping {
  provider_field: string;     // Provider API 的字段名
  canonical_field: string;    // 语义化标准字段名
  transform?: TransformType;  // 转换规则
  required: boolean;
  fallback?: unknown;         // 默认值
}
```

### AgentFieldMapping（扩展版）

```typescript
interface AgentFieldMapping extends FieldMapping {
  agent_field: string;  // Agent 侧使用的字段名
}
```

### 5 种 Transform 类型

| Transform         | 说明                                 |
|-------------------|--------------------------------------|
| `passthrough`     | 直接传递，不做转换                     |
| `extract_url`     | 从响应中提取 URL（如图片生成结果）       |
| `base64_decode`   | Base64 解码                           |
| `json_parse`      | JSON 字符串解析为对象                   |
| `cast_number`     | 强制转换为数字类型                      |

### 示例：OpenAI 字段映射

```typescript
const mappings: FieldMapping[] = [
  { provider_field: "messages", canonical_field: "prompt", required: true },
  { provider_field: "model", canonical_field: "model", required: true },
  { provider_field: "temperature", canonical_field: "temperature", required: false, fallback: 0.7 },
  { provider_field: "max_tokens", canonical_field: "max_tokens", required: false, fallback: 1024 },
];
```

## AccessProtocol — 4 种接入方式

```typescript
type AccessProtocol =
  | { kind: "api"; endpoint?: string; auth_type: "APIKey" | "Bearer" | "OAuth2" }
  | { kind: "mcp"; server_url: string; tools?: string[] }
  | { kind: "cli"; command: string; args?: string[] }
  | { kind: "a2a"; agent_url: string; skill?: string };
```

## CapabilityRequirement — 能力类型

```typescript
type CapabilityRequirement =
  | { kind: "structured-output"; strict: boolean }
  | { kind: "tool-calling"; tools: string[] }
  | { kind: "vision-input" }
  | { kind: "streaming"; required: boolean }
  | { kind: "image-generation"; modalities: string[] }
  | { kind: "controlnet"; types: string[] };
```

## ProviderCard & ProviderFeature

Provider Pack 的核心声明卡片：

```typescript
interface ProviderCard {
  provider: {
    id: string;
    name: string;
    version: string;
    api_version: string;
    base_url: string;
    auth_type: "APIKey" | "Bearer" | "OAuth2";
  };
  features: ProviderFeature[];
}

interface ProviderFeature {
  id: string;
  intent: string;
  name: string;
  description?: string;
  input: { fields: Field[] };
  output: { fields: Field[] };
  field_mappings: FieldMapping[];
  pricing?: ProviderPricing;
  limits?: Record<string, number | string>;
}
```

## 校验 & 规范化 API

```typescript
import {
  validateSchema,
  normalizeSchema,
  hashSchema,
  type Schema,
  type ValidationResult,
} from "@synapse-router/core";

const schema: Schema = {
  name: "my-schema",
  fields: [
    { name: "prompt", type: "string", required: true },
    { name: "size", type: "enum", required: false, enumValues: ["small", "large"] },
  ],
};

// 校验 Schema
const result: ValidationResult = validateSchema(schema);
// { valid: true, errors: [] }

// 规范化（字段名排序，enumValues 排序）
const normalized = normalizeSchema(schema);

// 哈希（用于 Schema 比对和缓存）
const hash = hashSchema(schema);
// "a3f2b8c..."
```

### 校验规则

- Schema `name` 必须为非空字符串
- 字段数量不超过 **10** 个
- 嵌套深度不超过 **2** 层
- enum 字段必须定义 `enumValues`，且不超过 **10** 个值
- 字段名在同一层级必须唯一

## ApiKeyWebhookEvent — Key 生命周期事件

```typescript
type ApiKeyWebhookEvent =
  | { type: "key.expiring_soon"; data: { days_remaining: number } }
  | { type: "key.grace_period_started"; data: { grace_ends_at: string } }
  | { type: "key.expired"; data: { schema_retention_days: number } }
  | { type: "schema.breaking_change"; data: BreakingChange }
  | { type: "schema.deprecated"; data: { feature_id: string; sunset_date: string } };
```

## SchemaMapping — 独立字段映射文档

```typescript
interface SchemaMapping {
  id: string;
  capability_id: string;
  provider_id: string;
  version: string;
  fields: SchemaMappingField[];         // 正向映射
  reverse_fields: SchemaMappingField[]; // 反向映射
}
```
