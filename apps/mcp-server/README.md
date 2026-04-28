# @synapse-router/mcp-server

Synapse Router 的 MCP (Model Context Protocol) Server。通过 stdio 传输 + JSON-RPC 2.0 协议，让 AI Agent 直接管理 Provider、Key 和协商。

## 安装

```bash
npm install @synapse-router/mcp-server
```

## MCP Protocol

- **传输层**: stdio（标准输入/输出）
- **协议**: JSON-RPC 2.0
- **MCP 版本**: `2024-11-05`

### 连接流程

```
Client (Claude/Cursor/etc)          MCP Server
        │                                │
        │  initialize                    │
        │ ──────────────────────────────►│
        │  ◄──────────────────────────── │  (capabilities + serverInfo)
        │                                │
        │  notifications/initialized     │
        │ ──────────────────────────────►│
        │                                │
        │  tools/list                    │
        │ ──────────────────────────────►│
        │  ◄──────────────────────────── │  (7 tools)
        │                                │
        │  resources/list                │
        │ ──────────────────────────────►│
        │  ◄──────────────────────────── │  (2 resources)
        │                                │
        │  tools/call                    │
        │ ──────────────────────────────►│
        │  ◄──────────────────────────── │  (result)
```

## 集成指南

### Claude Desktop

编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "synapse-router": {
      "command": "npx",
      "args": ["@synapse-router/mcp-server"]
    }
  }
}
```

### Cursor

在 Settings → MCP 中添加：

```json
{
  "mcpServers": {
    "synapse-router": {
      "command": "npx",
      "args": ["@synapse-router/mcp-server"]
    }
  }
}
```

### 其他 MCP 客户端

任何支持 stdio 传输的 MCP 客户端都可以接入：

```bash
npx @synapse-router/mcp-server
```

Server 从 stdin 读取 JSON-RPC 请求，向 stdout 写入 JSON-RPC 响应。

## 7 个 Tools

### `vault_set_key`

存储 Provider API Key。

```json
{
  "name": "vault_set_key",
  "arguments": {
    "provider": "openai",
    "key": "sk-your-key",
    "auth_type": "Bearer"
  }
}
```

| 参数        | 类型   | 必需 | 说明                              |
|------------|--------|------|-----------------------------------|
| `provider` | string | ✅   | Provider 名称                     |
| `key`      | string | ✅   | API Key 值                        |
| `auth_type`| string | ❌   | `APIKey` / `Bearer` / `OAuth2`，默认 `APIKey` |

### `vault_list_keys`

列出所有已存储 Key 的 Provider。

```json
{
  "name": "vault_list_keys",
  "arguments": {}
}
```

### `vault_get_key`

获取指定 Provider 的 API Key。

```json
{
  "name": "vault_get_key",
  "arguments": {
    "provider": "openai"
  }
}
```

### `provider_list`

列出所有可用的 Provider Pack（含内置和用户自定义）。

```json
{
  "name": "provider_list",
  "arguments": {}
}
```

### `provider_show`

查看指定 Provider 的详细信息。

```json
{
  "name": "provider_show",
  "arguments": {
    "provider": "openai"
  }
}
```

### `negotiate`

运行 Schema 协商。根据任务描述生成匹配的 Schema。

```json
{
  "name": "negotiate",
  "arguments": {
    "agent_schema": {
      "task": "image-generation",
      "goal": "Generate images from text prompts",
      "constraints": { "maxFields": 5 }
    },
    "provider_id": "stability"
  }
}
```

| 参数            | 类型   | 必需 | 说明                    |
|----------------|--------|------|------------------------|
| `agent_schema` | object | ✅   | 必须包含 `task` 字段     |
| `provider_id`  | string | ❌   | 限定协商到指定 Provider  |

### `execute`

执行 Provider 功能。

```json
{
  "name": "execute",
  "arguments": {
    "provider": "openai",
    "feature": "chat_post_v1_chat_completions",
    "input": {
      "messages": [{ "role": "user", "content": "Hello" }],
      "model": "gpt-4o-mini"
    }
  }
}
```

| 参数        | 类型   | 必需 | 说明              |
|------------|--------|------|------------------|
| `provider` | string | ✅   | Provider 名称     |
| `feature`  | string | ✅   | Feature ID       |
| `input`    | object | ✅   | 输入参数          |

## 2 个 Resources

### `providers://list`

所有 Provider Pack 的摘要信息。

```json
{
  "uri": "providers://list",
  "name": "providers_list",
  "mimeType": "application/json"
}
```

响应示例：

```json
{
  "providers": [
    {
      "name": "openai",
      "version": "1.0.0",
      "source": "builtin",
      "tasks": ["chat", "embeddings", "text-to-image"],
      "modalities": ["text", "image"]
    }
  ]
}
```

### `vault://status`

Vault 状态信息。

```json
{
  "uri": "vault://status",
  "name": "vault_status",
  "mimeType": "application/json"
}
```

响应示例：

```json
{
  "hasEncryptionKey": true,
  "providerCount": 2,
  "providers": ["openai", "stability"]
}
```

## Server Capabilities

```json
{
  "tools": { "listChanged": false },
  "resources": { "subscribe": false, "listChanged": false },
  "prompts": { "listChanged": false }
}
```

## 其他 JSON-RPC 方法

| 方法                        | 说明                     |
|----------------------------|--------------------------|
| `initialize`               | 初始化连接               |
| `notifications/initialized`| 客户端初始化完成通知      |
| `ping`                     | 心跳检测，返回 `{ pong: true }` |
