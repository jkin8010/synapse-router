---
sidebar_position: 10
title: API Reference
---

{/* This file is derived from docs/API.md in the project root. Edit the source and re-copy for significant changes. */}

# REST API 参考

Synapse Router HTTP API Server 提供 RESTful 接口，用于 Schema 协商、连接调用、Provider 管理和 API Key 管理。

**默认地址**：`http://localhost:3000`

## 启动 API Server

```bash
synapse serve
# Listening on http://0.0.0.0:3000
```

## 认证

当前版本（Phase 1）开发模式下未强制认证，生产部署前需启用。

## 健康检查

### GET /health

```bash
curl http://localhost:3000/health
# {"status":"ok","version":"0.1.0"}
```

---

## Provider 管理

### GET /providers

列出所有可用的 Provider Pack。

### GET /providers/:id

查看指定 Provider 的完整 Provider Card。

---

## Schema 协商

### POST /negotiate

根据 Agent Schema 匹配可用 Provider，生成协商结果并自动缓存为 Schema Lock。

**请求体**:

```json
{
  "agent_schema": {
    "agent_id": "my-agent",
    "agent_name": "My Agent",
    "version": "1.0.0",
    "features": [{
      "feature_id": "chat",
      "intent": "chat",
      "input_schema": { "name": "input", "fields": [{ "name": "messages", "type": "array", "required": true }] },
      "output_schema": { "name": "output", "fields": [{ "name": "choices", "type": "array" }] }
    }]
  },
  "provider_id": "openai"
}
```

**响应** `200 OK`:

```json
{
  "negotiation_id": "uuid-xxx",
  "accepted": [{
    "provider_id": "openai",
    "feature": { "id": "chat_post_v1_chat_completions", "intent": "chat" },
    "lock_id": "chat_openai_v1.0.0_xxx"
  }],
  "created_at": "2026-04-30T12:00:00.000Z"
}
```

> 相同 `intent + provider` 的后续协商会自动复用已缓存的 Schema Lock。

---

## 连接调用

### POST /execute

连接指定 Provider 并调用其 Feature。支持两种模式。

#### 模式一：直接指定 Provider + Intent

**请求**:

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "deepseek",
    "intent": "chat",
    "input": {
      "messages": [{"role": "user", "content": "Hello"}],
      "model": "deepseek-chat"
    }
  }'
```

**请求体**:

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `provider` | string | ✅ | Provider ID（如 `openai`, `deepseek`） |
| `intent` | string | ✅ | Intent ID（如 `chat`, `embeddings`） |
| `input` | object | ✅ | 输入参数（Provider 原生格式或 canonical 格式） |

**响应** `200 OK`:

```json
{
  "output": {
    "model": "deepseek-v4-flash",
    "choices": [{ "message": { "role": "assistant", "content": "Hello! How can I help?" } }],
    "usage": { "prompt_tokens": 9, "completion_tokens": 46, "total_tokens": 55 }
  },
  "raw": { ... },
  "meta": {
    "provider": "deepseek",
    "feature_id": "chat_post_v1_chat_completions",
    "lock_id": "chat_deepseek_v1.0.0_xxx",
    "latency_ms": 4689
  }
}
```

#### 模式二：通过 negotiation_id 执行

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "negotiation_id": "uuid-xxx",
    "input": { "messages": [{"role": "user", "content": "Hello"}], "model": "gpt-4o-mini" }
  }'
```

**错误**:

| 状态码 | code | 说明 |
|--------|------|------|
| 400 | `INVALID_REQUEST` | 缺少必填参数 |
| 404 | `PROVIDER_NOT_FOUND` | Provider 不存在 |
| 401 | `AUTH_FAILED` | API Key 无效或缺失 |

---

## Vault 管理

### POST /vault/keys

存储 API Key。

```bash
curl -X POST http://localhost:3000/vault/keys \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","key":"sk-proj-xxxx"}'
```

### GET /vault/keys

列出已存储的 Provider（不返回 Key 值）。

### DELETE /vault/keys/:provider

删除指定 Provider 的 API Key。

### POST /vault/verify/:provider

验证指定 Provider 的 API Key 是否有效。

```bash
curl -X POST http://localhost:3000/vault/verify/openai
# {"provider":"openai","valid":true}
```

---

## 错误响应格式

所有错误响应统一格式：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description"
  }
}
```

## 编程使用

```typescript
import { startServer } from "@synapse-router/api";

const server = await startServer({
  port: 3000,
  hostname: "0.0.0.0",
  packsDir: "./packs",
});
```
