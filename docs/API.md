# REST API 参考

Synapse Router HTTP API Server 提供 RESTful 接口，用于 Schema 协商、Provider 管理、API Key 管理和执行调用。

**默认地址**：`http://localhost:3000`

## 启动 API Server

```bash
# 使用 CLI
synapse serve

# 直接启动
npx @synapse-router/api

# 自定义端口
PORT=8080 npx @synapse-router/api
```

## 认证

API 使用 **API Key** 认证。在请求头中传入：

```
Authorization: Bearer <your-api-key>
```

> 当前版本（Phase 1）开发模式下未强制认证，生产部署前需启用。

## 健康检查

### GET /health

检查服务是否正常运行。

**请求**

```bash
curl http://localhost:3000/health
```

**响应** `200 OK`

```json
{
  "status": "ok"
}
```

---

## Provider 管理

### GET /providers

列出所有可用的 Provider Pack。

**请求**

```bash
curl http://localhost:3000/providers
```

**响应** `200 OK`

```json
[
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
        "name": "Chat Completions"
      },
      {
        "id": "embeddings_post_v1_embeddings",
        "intent": "embeddings",
        "name": "Embeddings"
      }
    ]
  }
]
```

### GET /providers/:id

查看指定 Provider 的详细信息，包含完整的 Feature 定义。

**请求**

```bash
curl http://localhost:3000/providers/openai
```

**响应** `200 OK`

返回完整的 `ProviderCard`，包含所有 features、field_mappings、pricing 等。

**错误**

| 状态码 | code               | 说明            |
|--------|--------------------|-----------------|
| 404    | `PROVIDER_NOT_FOUND` | Provider 不存在 |

---

## Schema 协商

### POST /negotiate

根据 Agent Schema 匹配可用的 Provider，生成协商结果。

**请求**

```bash
curl -X POST http://localhost:3000/negotiate \
  -H "Content-Type: application/json" \
  -d '{
    "agent_schema": {
      "agent_id": "my-agent",
      "agent_name": "My Agent",
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
              { "name": "prompt", "type": "string", "required": true }
            ]
          },
          "output_schema": {
            "name": "image_output",
            "fields": [
              { "name": "image_url", "type": "string" }
            ]
          },
          "capabilities": [
            { "kind": "image-generation", "modalities": ["png"] }
          ]
        }
      ]
    },
    "provider_id": "stability"
  }'
```

**请求体**

| 参数            | 类型         | 必需 | 说明                    |
|----------------|-------------|------|------------------------|
| `agent_schema` | object      | ✅   | Agent 需求声明           |
| `provider_id`  | string      | ❌   | 限定协商到指定 Provider  |

**响应** `200 OK`

```json
{
  "negotiation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "accepted": [
    {
      "provider_id": "stability",
      "feature": {
        "id": "text_to_image_post_v1_generation_text2img",
        "intent": "text-to-image",
        "name": "Text to Image"
      },
      "schema_mapping": {
        "id": "map-uuid-xxx",
        "capability_id": "text_to_image_post_v1_generation_text2img",
        "provider_id": "stability",
        "version": "1.0.0",
        "fields": [
          {
            "canonical_field": "prompt",
            "provider_field": "text_prompts",
            "required": true
          }
        ],
        "reverse_fields": [
          {
            "name": "artifacts",
            "type": "array"
          }
        ]
      }
    }
  ],
  "rejected": [
    {
      "provider_id": "replicate",
      "reasons": ["intent mismatch"]
    }
  ],
  "created_at": "2026-04-28T12:00:00.000Z"
}
```

**错误**

| 状态码 | code              | 说明                          |
|--------|-------------------|-------------------------------|
| 400    | `INVALID_REQUEST` | agent_schema 缺失或格式错误    |

---

## 执行

### POST /execute

执行 Provider 调用。支持两种模式：通过协商 ID 执行，或直接指定 Provider + Feature。

#### 模式一：通过 negotiation_id 执行

**请求**

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "negotiation_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "input": {
      "prompt": "A cat in space",
      "width": 1024,
      "height": 1024
    }
  }'
```

#### 模式二：直接指定 Provider + Feature

**请求**

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "openai",
    "feature_id": "chat_post_v1_chat_completions",
    "input": {
      "messages": [{ "role": "user", "content": "Hello" }],
      "model": "gpt-4o-mini"
    }
  }'
```

**请求体**

| 参数              | 类型   | 必需 | 说明                              |
|------------------|--------|------|-----------------------------------|
| `negotiation_id` | string | ❌*  | 协商 ID（与 provider_id 二选一）    |
| `provider_id`    | string | ❌*  | Provider ID                      |
| `feature_id`     | string | ❌   | Feature ID（provider_id 模式下）   |
| `input`          | object | ❌   | 输入参数                          |

> *`negotiation_id` 和 `provider_id` 必须提供其一。

**响应** `200 OK`

```json
{
  "output": {
    "provider_id": "stability",
    "feature_id": "text_to_image_post_v1_generation_text2img",
    "request": {
      "prompt": "A cat in space",
      "width": 1024,
      "height": 1024
    },
    "api_key_present": true,
    "_meta": {
      "provider_base_url": "https://api.stability.ai/v1",
      "auth_type": "APIKey",
      "feature_intent": "text-to-image"
    }
  },
  "provider_id": "stability",
  "latency_ms": 42
}
```

**错误**

| 状态码 | code                    | 说明                              |
|--------|-------------------------|-----------------------------------|
| 400    | `INVALID_REQUEST`       | 缺少 negotiation_id 和 provider_id |
| 400    | `NO_ACCEPTED_PROVIDERS` | 协商结果无匹配 Provider            |
| 404    | `NEGOTIATION_NOT_FOUND` | negotiation_id 不存在或过期        |
| 404    | `PROVIDER_NOT_FOUND`    | Provider 不存在                    |

---

## Vault 管理

### GET /vault/keys

列出所有已存储 Key 的 Provider（不返回 Key 值）。

**请求**

```bash
curl http://localhost:3000/vault/keys
```

**响应** `200 OK`

```json
{
  "keys": ["openai", "stability"]
}
```

### POST /vault/keys

存储 API Key。

**请求**

```bash
curl -X POST http://localhost:3000/vault/keys \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "key": "sk-proj-xxxx",
    "auth_type": "Bearer"
  }'
```

**请求体**

| 参数        | 类型   | 必需 | 说明                              |
|------------|--------|------|-----------------------------------|
| `provider` | string | ✅   | Provider 名称                     |
| `key`      | string | ✅   | API Key 值                        |
| `auth_type`| string | ✅   | `APIKey` / `Bearer` / `OAuth2`    |

**响应** `200 OK`

```json
{
  "stored": true,
  "provider": "openai"
}
```

### DELETE /vault/keys/:provider

删除指定 Provider 的 API Key。

**请求**

```bash
curl -X DELETE http://localhost:3000/vault/keys/openai
```

**响应** `200 OK`

```json
{
  "removed": true,
  "provider": "openai"
}
```

### POST /vault/verify/:provider

验证 API Key 格式是否正确。

**请求**

```bash
curl -X POST http://localhost:3000/vault/verify/openai
```

**响应** `200 OK`

```json
{
  "provider": "openai",
  "valid": true
}
```

---

## CORS

API 默认开启 CORS 支持：

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

---

## 错误响应格式

所有错误响应遵循统一格式：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description"
  }
}
```

---

## 编程使用

```typescript
import { createServer, startServer } from "@synapse-router/api";

// 快速启动
const server = await startServer({
  port: 3000,
  hostname: "0.0.0.0",
  vaultDir: "/path/to/vault",
  packsDir: "/path/to/packs",
});

// 仅创建（用于测试）
const server = createServer({ packsDir: "./packs" });
```
