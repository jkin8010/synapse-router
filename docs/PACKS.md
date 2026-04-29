# Provider Pack 开发指南

Provider Pack 是 Synapse Router 的核心抽象——每个 Provider 一个 Pack，声明其能力、字段映射、定价和限速信息。Pack 让 Router 能自动匹配 Agent 需求与 Provider 能力。

## Pack 目录结构

```
packs/<provider-id>/
├── provider-card.json    # Provider 核心卡片（身份 + 服务配置 + 功能声明）
└── dsl/                  # Agent Schema DSL 文件（每个 Feature 一个）
    ├── feature_id_1.json
    ├── feature_id_2.json
    └── ...
```

### 文件职责

| 文件 | 职责 | 必需 |
|------|------|------|
| `provider-card.json` | 定义 Provider 身份、Service 配置、Feature 列表、Field Mappings、定价、限速 | ✅ |
| `dsl/<feature-id>.json` | 单个 Feature 的 Agent Schema，供协商引擎匹配 | ✅ |

## provider-card.json 完整字段说明

`provider-card.json` 由三个顶级对象组成：`provider`、`service`、`features`。

### provider（身份标识）

定义 Provider 的唯一身份和基础信息。

| 字段 | 类型 | 必需 | 说明 | 示例 |
|------|------|------|------|------|
| `id` | string | ✅ | Provider 唯一标识（小写字母+数字+连字符） | `"openai"` |
| `name` | string | ✅ | Provider 显示名称 | `"OpenAI"` |
| `docs_url` | string | ✅ | 官方 API 文档链接 | `"https://platform.openai.com/docs/api-reference"` |

### service（服务配置）

定义 Provider 服务的运行参数。

| 字段 | 类型 | 必需 | 说明 | 示例 |
|------|------|------|------|------|
| `id` | string | ✅ | Service 标识，通常与 `provider.id` 一致 | `"openai"` |
| `name` | string | ✅ | Service 显示名称 | `"OpenAI"` |
| `version` | string | ✅ | Pack 版本号（SemVer） | `"1.0.0"` |
| `api_version` | string | ✅ | Provider API 版本 | `"2024-01-01"` |
| `base_url` | string | ✅ | API 基础地址 | `"https://api.openai.com/v1"` |
| `auth_type` | string | ✅ | 认证方式：`Bearer` / `APIKey` / `OAuth2` | `"Bearer"` |

### features（功能声明）

声明该 Provider 提供的每个功能。

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | Feature 唯一标识，通常与 API 操作对应 |
| `intent` | string | ✅ | 意图类型，用于协商匹配（如 `chat`、`text-to-image`） |
| `name` | string | ✅ | Feature 显示名称 |
| `description` | string | ✅ | Feature 描述 |
| `input` | object | ✅ | 输入参数定义（见下方 input 结构） |
| `output` | object | ✅ | 输出参数定义（见下方 output 结构） |
| `field_mappings` | array | ✅ | 规范字段到 Provider 字段的映射（见下方映射结构） |
| `pricing` | object | ❌ | 定价信息 |
| `limits` | object | ❌ | 限速信息 |

#### input / output 结构

```json
{
  "input": {
    "name": "ChatCompletionInput",
    "fields": [
      {
        "name": "messages",
        "type": "array",
        "required": true,
        "description": "Message array"
      },
      {
        "name": "model",
        "type": "string",
        "required": true
      },
      {
        "name": "temperature",
        "type": "number",
        "required": false
      }
    ]
  }
}
```

**字段类型**：`string` | `number` | `boolean` | `array` | `object`

可选属性：

| 属性 | 类型 | 说明 |
|------|------|------|
| `required` | boolean | 是否必填 |
| `description` | string | 字段描述 |
| `enum` | string[] | 枚举值列表 |

#### field_mappings 结构

将 Agent Schema 的规范字段映射到 Provider 的实际字段。

```json
{
  "field_mappings": [
    {
      "canonical_field": "prompt",
      "provider_field": "messages",
      "required": true
    },
    {
      "canonical_field": "temperature",
      "provider_field": "temperature",
      "required": false,
      "fallback": 0.7
    }
  ]
}
```

| 属性 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `canonical_field` | string | ✅ | 规范字段名（Router 内部标准） |
| `provider_field` | string | ✅ | Provider API 的实际字段名 |
| `required` | boolean | ✅ | 该映射是否必需 |
| `fallback` | any | ❌ | 默认值（当 Agent 未提供时使用） |
| `transform` | string | ❌ | 数据转换方式（如 `base64_decode`、`passthrough`） |

#### pricing 结构

```json
{
  "pricing": {
    "input": 0.0015,
    "output": 0.002,
    "unit": "1k tokens"
  }
}
```

#### limits 结构

```json
{
  "limits": {
    "rpm": 500,
    "tpm": 150000
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `rpm` | number | 每分钟请求数限制 |
| `tpm` | number | 每分钟 token 数限制（可选） |

### 完整示例

```json
{
  "provider": {
    "id": "openai",
    "name": "OpenAI",
    "docs_url": "https://platform.openai.com/docs/api-reference"
  },
  "service": {
    "id": "openai",
    "name": "OpenAI",
    "version": "1.0.0",
    "api_version": "2024-01-01",
    "base_url": "https://api.openai.com/v1",
    "auth_type": "Bearer"
  },
  "features": [
    {
      "id": "chat_post_v1_chat_completions",
      "intent": "chat",
      "name": "Chat Completions",
      "description": "Generate chat-based language model responses",
      "input": {
        "name": "ChatCompletionInput",
        "fields": [
          { "name": "messages", "type": "array", "required": true },
          { "name": "model", "type": "string", "required": true },
          { "name": "temperature", "type": "number", "required": false },
          { "name": "max_tokens", "type": "number", "required": false }
        ]
      },
      "output": {
        "name": "ChatCompletionOutput",
        "fields": [
          { "name": "id", "type": "string" },
          { "name": "choices", "type": "array" },
          { "name": "usage", "type": "object" }
        ]
      },
      "field_mappings": [
        { "canonical_field": "prompt", "provider_field": "messages", "required": true },
        { "canonical_field": "model", "provider_field": "model", "required": true },
        { "canonical_field": "temperature", "provider_field": "temperature", "required": false, "fallback": 0.7 }
      ],
      "pricing": { "input": 0.0015, "output": 0.002, "unit": "1k tokens" },
      "limits": { "rpm": 500, "tpm": 150000 }
    }
  ]
}
```

## DSL 文件格式

每个 Feature 对应一个 Agent Schema DSL 文件，存放在 `dsl/<feature-id>.json`。

```json
{
  "agent_id": "openai-gpt4",
  "agent_name": "OpenAI GPT-4",
  "version": "1.0.0",
  "access_protocol": {
    "kind": "api",
    "auth_type": "Bearer"
  },
  "features": [
    {
      "feature_id": "chat_post_v1_chat_completions",
      "feature_name": "Chat Completions",
      "intent": "chat",
      "input_schema": {
        "name": "ChatCompletionInput",
        "fields": [
          { "name": "messages", "type": "array", "required": true, "description": "Message array with role and content" },
          { "name": "model", "type": "string", "required": true, "description": "Model identifier" },
          { "name": "temperature", "type": "number", "required": false, "description": "Sampling temperature 0-2" }
        ]
      },
      "output_schema": {
        "name": "ChatCompletionOutput",
        "fields": [
          { "name": "id", "type": "string" },
          { "name": "choices", "type": "array" },
          { "name": "usage", "type": "object" }
        ]
      },
      "field_mappings": [
        { "canonical_field": "prompt", "provider_field": "messages", "required": true },
        { "canonical_field": "model", "provider_field": "model", "required": true }
      ],
      "capabilities": [
        { "kind": "text-generation", "modalities": ["text"] }
      ]
    }
  ]
}
```

### DSL 关键字段

| 字段 | 说明 |
|------|------|
| `agent_id` | Agent 唯一标识 |
| `agent_name` | Agent 显示名称 |
| `version` | Agent 版本 |
| `access_protocol.kind` | 接入协议类型（`api`/`mcp`） |
| `access_protocol.auth_type` | 认证方式 |
| `features[].feature_id` | Feature 唯一标识，需与 provider-card.json 中的 `id` 一致 |
| `features[].intent` | 意图类型，协商时用于匹配 |
| `features[].input_schema` | 输入参数 Schema |
| `features[].output_schema` | 输出参数 Schema |
| `features[].field_mappings` | 字段映射 |
| `features[].capabilities` | 能力声明 |

## 如何手动创建 Pack

### 步骤 1：创建目录

```bash
mkdir -p packs/my-provider/dsl
```

### 步骤 2：编写 provider-card.json

```bash
cat > packs/my-provider/provider-card.json << 'EOF'
{
  "provider": {
    "id": "my-provider",
    "name": "My Provider",
    "docs_url": "https://docs.my-provider.com/api"
  },
  "service": {
    "id": "my-provider",
    "name": "My Provider",
    "version": "1.0.0",
    "api_version": "v1",
    "base_url": "https://api.my-provider.com/v1",
    "auth_type": "Bearer"
  },
  "features": [
    {
      "id": "generate_image",
      "intent": "text-to-image",
      "name": "Generate Image",
      "description": "Generate images from text prompts",
      "input": {
        "name": "GenerateImageInput",
        "fields": [
          { "name": "prompt", "type": "string", "required": true, "description": "Text prompt" },
          { "name": "width", "type": "number", "required": false },
          { "name": "height", "type": "number", "required": false }
        ]
      },
      "output": {
        "name": "GenerateImageOutput",
        "fields": [
          { "name": "image_url", "type": "string" }
        ]
      },
      "field_mappings": [
        { "canonical_field": "prompt", "provider_field": "prompt", "required": true },
        { "canonical_field": "width", "provider_field": "width", "required": false },
        { "canonical_field": "height", "provider_field": "height", "required": false }
      ],
      "pricing": { "per_image": 0.04, "unit": "USD" },
      "limits": { "rpm": 60 }
    }
  ]
}
EOF
```

### 步骤 3：编写 DSL 文件

```bash
cat > packs/my-provider/dsl/generate_image.json << 'EOF'
{
  "agent_id": "my-provider-agent",
  "agent_name": "My Provider Agent",
  "version": "1.0.0",
  "access_protocol": { "kind": "api", "auth_type": "Bearer" },
  "features": [
    {
      "feature_id": "generate_image",
      "feature_name": "Generate Image",
      "intent": "text-to-image",
      "input_schema": {
        "name": "GenerateImageInput",
        "fields": [
          { "name": "prompt", "type": "string", "required": true },
          { "name": "width", "type": "number", "required": false },
          { "name": "height", "type": "number", "required": false }
        ]
      },
      "output_schema": {
        "name": "GenerateImageOutput",
        "fields": [
          { "name": "image_url", "type": "string" }
        ]
      },
      "field_mappings": [
        { "canonical_field": "prompt", "provider_field": "prompt", "required": true },
        { "canonical_field": "width", "provider_field": "width", "required": false },
        { "canonical_field": "height", "provider_field": "height", "required": false }
      ],
      "capabilities": [{ "kind": "image-generation", "modalities": ["png"] }]
    }
  ]
}
EOF
```

## 如何使用 synapse generate 自动生成

Pack Generator 从 OpenAPI 3.0 Spec 自动生成 Provider Pack，省去手动编写。

### CLI 方式

```bash
npx @synapse-router/pack-generator --from-url https://api.example.com/openapi.json
```

### 编程方式

```typescript
import { generatePackFromURL, writePack } from "@synapse-router/pack-generator";

const { providerCard, dslFiles } = await generatePackFromURL(
  "https://api.example.com/openapi.json",
  {
    providerId: "my-provider",
    providerName: "My Provider",
    authType: "Bearer",
  }
);

await writePack("./packs/my-provider", providerCard, dslFiles);
```

### 生成流程

```
OpenAPI Spec
    │
    ▼
1. 解析 paths + methods
2. JSON Schema → Field[]（处理 $ref、allOf 等）
3. 推断 Intent + Capability（基于 URL 和 operationId）
4. 生成 Field Mappings（别名匹配 canonical 字段）
5. 检测 Auth Type（从 securitySchemes）
6. 输出 provider-card.json + dsl/*.json
```

### Intent 推断规则

| URL Pattern | Intent | Capability |
|-------------|--------|------------|
| `/images/generations` | `text-to-image` | `image-generation` |
| `/chat/completions` | `chat` | `structured-output` |
| `/embeddings` | `embeddings` | `tool-calling` |
| `/audio/transcriptions` | `speech-to-text` | `vision-input` |

### Field Alias 体系

生成 Field Mapping 时自动匹配：

| Canonical Field | 匹配的别名 |
|-----------------|-----------|
| `prompt` | prompt, input, text, message, content |
| `model` | model, engine, model_id, modelName |
| `width` | width, image_width |
| `height` | height, image_height |
| `image_url` | image_url, imageUrl, image, url |

## Pack 验证流程

### 编程验证

```typescript
import { validateProviderCard } from "@synapse-router/providers";
import * as fs from "fs";

const card = JSON.parse(
  fs.readFileSync("packs/my-provider/provider-card.json", "utf8")
);

const result = validateProviderCard(card);

if (!result.valid) {
  console.error("Pack 验证失败:", result.errors);
  process.exit(1);
} else {
  console.log("✓ Pack 格式正确");
}
```

### 验证要求

#### provider 对象
- `id`: 非空字符串，小写字母+数字+连字符
- `name`: 非空字符串
- `docs_url`: 有效 URL

#### service 对象
- `id`: 非空字符串
- `name`: 非空字符串
- `version`: 有效 SemVer 格式
- `api_version`: 非空字符串
- `base_url`: 有效 URL
- `auth_type`: 必须为 `Bearer`、`APIKey` 或 `OAuth2`

#### features 数组
- 至少包含一个 Feature
- 每个 Feature 必须有 `id`、`intent`、`name`、`description`
- `input.fields` 和 `output.fields` 为非空数组
- `field_mappings` 为非空数组

#### DSL 文件
- 文件名需与对应 Feature 的 `id` 一致
- `feature_id` 必须与 provider-card.json 中的 Feature `id` 匹配
- `intent` 必须一致

### 运行完整测试

```bash
pnpm test
# 确保所有 Pack（预置 + 自定义）通过验证
```
