---
sidebar_position: 10
title: API Reference
---

{/* This file is derived from docs/API.md in the project root. Edit the source and re-copy for significant changes. */}

# REST API Reference

The Synapse Router HTTP API Server provides RESTful endpoints for Schema Negotiation, connection calls, Provider management, and API Key management.

**Default address:** `http://localhost:3011`

## Starting the API Server

```bash
synapse serve
# Listening on http://0.0.0.0:3000
```

## Authentication

In the current version (Phase 1), authentication is not enforced in development mode. It must be enabled before production deployment.

## Health Check

### GET /health

```bash
curl http://localhost:3011/health
# {"status":"ok","version":"0.1.0"}
```

---

## Provider Management

### GET /providers

List all available Provider Packs.

### GET /providers/:id

View the full Provider Card for a specific Provider.

---

## Schema Negotiation

### POST /negotiate

Match available Providers against an Agent Schema, generate negotiation results, and automatically cache them as a Schema Lock.

**Request Body:**

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

**Response** `200 OK`:

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

> Subsequent negotiations for the same `intent + provider` automatically reuse the cached Schema Lock.

---

## Connection Calls

### POST /execute

Connect to a specified Provider and call its Feature. Two modes are supported.

#### Mode 1: Direct Provider + Intent

**Request:**

```bash
curl -X POST http://localhost:3011/execute \
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

**Request Body:**

| Parameter | Type | Required | Description |
|------|------|------|------|
| `provider` | string | ✅ | Provider ID (e.g., `openai`, `deepseek`) |
| `intent` | string | ✅ | Intent ID (e.g., `chat`, `embeddings`) |
| `input` | object | ✅ | Input parameters (Provider native format or canonical format) |

**Response** `200 OK`:

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

#### Mode 2: Via negotiation_id

```bash
curl -X POST http://localhost:3011/execute \
  -H "Content-Type: application/json" \
  -d '{
    "negotiation_id": "uuid-xxx",
    "input": { "messages": [{"role": "user", "content": "Hello"}], "model": "gpt-4o-mini" }
  }'
```

**Errors:**

| Status Code | code | Description |
|--------|------|------|
| 400 | `INVALID_REQUEST` | Missing required parameters |
| 404 | `PROVIDER_NOT_FOUND` | Provider does not exist |
| 401 | `AUTH_FAILED` | API Key is invalid or missing |

---

## Vault Management

### POST /vault/keys

Store an API Key.

```bash
curl -X POST http://localhost:3011/vault/keys \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","key":"sk-proj-xxxx"}'
```

### GET /vault/keys

List stored Providers (does not return Key values).

### DELETE /vault/keys/:provider

Delete a specific Provider's API Key.

### POST /vault/verify/:provider

Verify whether a specific Provider's API Key is valid.

```bash
curl -X POST http://localhost:3011/vault/verify/openai
# {"provider":"openai","valid":true}
```

---

## Error Response Format

All error responses use a unified format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description"
  }
}
```

## Programmatic Usage

```typescript
import { startServer } from "@synapse-router/api";

const server = await startServer({
  port: 3000,
  hostname: "0.0.0.0",
  packsDir: "./packs",
});
```
