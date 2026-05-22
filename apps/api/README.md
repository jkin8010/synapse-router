# @synapse-router/api

Synapse Router HTTP API Server。提供 RESTful API 进行 Schema 协商、Provider 管理、API Key 管理和执行调用。

## 安装

```bash
npm install @synapse-router/api
```

## 快速启动

```bash
# 直接启动
npx @synapse-router/api

# 或通过 CLI
synapse serve

# 自定义端口和目录
PORT=8080 npx @synapse-router/api
```

默认监听 `http://0.0.0.0:3000`。

## 编程使用

```typescript
import { createServer, startServer, type ServerOptions } from "@synapse-router/api";

// 创建并启动
const server = await startServer({
  port: 3000,
  hostname: "0.0.0.0",
  vaultDir: "/path/to/vault",    // 默认 <repo-root>/.vault
  packsDir: "/path/to/packs",    // 默认 <repo-root>/packs
});

// 或仅创建（用于测试）
const server = createServer({ packsDir: "./packs" });
```

## API 端点

### 健康检查

```
GET /health
```

```bash
curl http://localhost:3011/health
# { "status": "ok" }
```

---

### Provider 管理

#### 列出所有 Provider

```
GET /providers
```

```bash
curl http://localhost:3011/providers
```

响应：

```json
[
  {
    "provider": {
      "id": "openai",
      "name": "OpenAI",
      "version": "1.0.0",
      "api_version": "2024-01-01",
      "base_url": "https://api.openai.com/v1",
      "auth_type": "Bearer"
    },
    "features": [
      { "id": "chat_post_v1_chat_completions", "intent": "chat", "name": "Chat Completions" },
      { "id": "embeddings_post_v1_embeddings", "intent": "embeddings", "name": "Embeddings" }
    ]
  }
]
```

#### 查看 Provider 详情

```
GET /providers/:id
```

```bash
curl http://localhost:3011/providers/openai
```

响应：完整的 `ProviderCard` 对象，包含所有 features、field_mappings、pricing 等。

错误：

| 状态码 | code               | 说明               |
|--------|-------------------|--------------------|
| 404    | `PROVIDER_NOT_FOUND` | Provider 不存在    |

---

### 协商

#### 运行 Schema 协商

```
POST /negotiate
```

请求：

```json
{
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
        "input_schema": { "name": "input", "fields": [{ "name": "prompt", "type": "string", "required": true }] },
        "output_schema": { "name": "output", "fields": [{ "name": "image_url", "type": "string" }] },
        "capabilities": [{ "kind": "image-generation", "modalities": ["png"] }]
      }
    ]
  },
  "provider_id": "stability"
}
```

| 参数            | 类型         | 必需 | 说明                     |
|----------------|-------------|------|-------------------------|
| `agent_schema` | AgentSchema | ✅   | Agent 需求声明            |
| `provider_id`  | string      | ❌   | 限定到指定 Provider       |

响应：

```json
{
  "negotiation_id": "uuid-xxx",
  "accepted": [
    {
      "provider_id": "stability",
      "feature": { "id": "text_to_image_...", "intent": "text-to-image", ... },
      "schema_mapping": {
        "id": "uuid-yyy",
        "capability_id": "text_to_image_...",
        "provider_id": "stability",
        "version": "1.0.0",
        "fields": [...],
        "reverse_fields": [...]
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

错误：

| 状态码 | code              | 说明                          |
|--------|------------------|-------------------------------|
| 400    | `INVALID_REQUEST` | agent_schema 缺失或格式错误   |

---

### 执行

#### 执行 Provider 调用

```
POST /execute
```

请求（通过 negotiation_id）：

```json
{
  "negotiation_id": "uuid-xxx",
  "input": {
    "prompt": "A cat in space",
    "width": 1024,
    "height": 1024
  }
}
```

请求（直接指定 provider + feature）：

```json
{
  "provider_id": "openai",
  "feature_id": "chat_post_v1_chat_completions",
  "input": {
    "messages": [{ "role": "user", "content": "Hello" }],
    "model": "gpt-4o-mini"
  }
}
```

| 参数              | 类型   | 必需 | 说明                          |
|------------------|--------|------|-------------------------------|
| `negotiation_id` | string | ❌*  | 协商 ID（与 provider_id 二选一）|
| `provider_id`    | string | ❌*  | Provider ID                   |
| `feature_id`     | string | ❌   | Feature ID（provider_id 模式） |
| `input`          | object | ❌   | 输入参数                      |

> *`negotiation_id` 和 `provider_id` 必须提供其一。

响应：

```json
{
  "output": {
    "provider_id": "stability",
    "feature_id": "text_to_image_...",
    "request": { "prompt": "A cat in space", "width": 1024, "height": 1024 },
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

错误：

| 状态码 | code                  | 说明                          |
|--------|----------------------|-------------------------------|
| 400    | `INVALID_REQUEST`    | 缺少 negotiation_id 和 provider_id |
| 400    | `NO_ACCEPTED_PROVIDERS` | 协商结果无匹配 Provider      |
| 404    | `NEGOTIATION_NOT_FOUND` | negotiation_id 不存在或过期  |
| 404    | `PROVIDER_NOT_FOUND`  | Provider 不存在               |

---

### Vault 管理

#### 列出 Key

```
GET /vault/keys
```

```bash
curl http://localhost:3011/vault/keys
# { "keys": ["openai", "stability"] }
```

#### 存储 Key

```
POST /vault/keys
```

```bash
curl -X POST http://localhost:3011/vault/keys \
  -H "Content-Type: application/json" \
  -d '{"provider": "openai", "key": "sk-xxx", "auth_type": "Bearer"}'
# { "stored": true, "provider": "openai" }
```

| 参数        | 类型   | 必需 | 说明                              |
|------------|--------|------|-----------------------------------|
| `provider` | string | ✅   | Provider 名称                     |
| `key`      | string | ✅   | API Key 值                        |
| `auth_type`| string | ✅   | `APIKey` / `Bearer` / `OAuth2`   |

#### 删除 Key

```
DELETE /vault/keys/:provider
```

```bash
curl -X DELETE http://localhost:3011/vault/keys/openai
# { "removed": true, "provider": "openai" }
```

#### 验证 Key 格式

```
POST /vault/verify/:provider
```

```bash
curl -X POST http://localhost:3011/vault/verify/openai
# { "provider": "openai", "valid": true }
```

---

## CORS

API 默认开启 CORS 支持：

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

## 协商机制

API Server 的协商逻辑基于 Intent 匹配：

1. 遍历所有 Provider Pack（或指定的 `provider_id`）
2. 对每个 Provider，检查是否有 Feature 的 Intent 与 Agent Schema 的 Intent 匹配
3. Intent 匹配规则：标准化后（去 `-`、`_`，转小写）互相包含
4. 匹配成功 → 生成 `AcceptedMatch`（含 Schema Mapping）
5. 匹配失败 → 生成 `RejectedMatch`（含原因）
6. 协商结果以 `negotiation_id` 存储，用于后续执行
