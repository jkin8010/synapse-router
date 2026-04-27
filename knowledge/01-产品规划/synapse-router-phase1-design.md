# Synapse Router Phase 1 实施设计

> 纯客户端工具形态 — Schema 协商契约基础设施

**状态**: ✅ 决策确认  
**日期**: 2026-04-27

---

## 0. 确认的决策

| # | 决策 | 确认 |
|---|------|------|
| 1 | Phase 1 形态 | **形态 2：纯客户端工具** |
| 2 | Provider Pack 来源 | **先开发 Provider Pack 生成器（简版），Phase 2 升级为云端 Registry** |
| 3 | Schema Negotiation 小模型 | **本地可选 + 云端 LLM fallback（仅传意图，不传 Key）** |
| 4 | 开源策略 | **核心开源，Provider Pack 可选闭源** |
| 5 | 接入优先级 | **API 接口优先，MCP Server / CLI 用于演示和应用** |

---

## 1. 产品形态

### 用户拿到什么

```
Synapse Router Phase 1 产品包
│
├── @synapse-router/core              # 核心：Schema 类型 + 协商 + 锁定
├── @synapse-router/api               # HTTP API Server（首要入口）
├── @synapse-router/mcp               # MCP Server（演示/应用入口）
├── @synapse-router/cli               # CLI（演示/调试入口）
├── @synapse-router/pack-generator    # Provider Pack 生成器
├── @synapse-router/pack-openai       # 预置 Pack: OpenAI
├── @synapse-router/pack-replicate    # 预置 Pack: Replicate
└── @synapse-router/pack-stability    # 预置 Pack: Stability AI
```

### 优先级排序

```
1. API Server (localhost)     ← 首要，任何 Agent 都能 HTTP 调用
2. Provider Pack Generator   ← 核心，自动生成 Provider 适配
3. Schema Negotiation        ← 核心，Agent 协商契约
4. Schema Lock + 执行        ← 核心，锁定后直连 Provider
5. MCP Server                ← 演示/应用入口
6. CLI                       ← 演示/调试入口
```

---

## 2. 核心模块设计

### 2.1 API Server（首要入口）

本地 HTTP API，任何 Agent 都能调用：

```
POST /v1/negotiate          协商 Schema
POST /v1/execute/:schema_id 执行调用（直连 Provider）
GET  /v1/status/:schema_id  查询 Schema 状态
GET  /v1/providers          列出可用 Provider
GET  /v1/providers/:name    查看 Provider 详情和可用 Feature
POST /v1/keys               管理 API Key（存本地）
GET  /v1/schema/:schema_id  获取锁定的 Schema
```

调用流程：

```
1. POST /v1/providers
   → 返回所有已安装的 Provider Pack 及其能力

2. POST /v1/negotiate
   Body: { intent: "text-to-image", provider: "openai", 
           input_fields: ["prompt", "size"], output_fields: ["url", "width"] }
   → 调用本地/云端小模型协商
   → 返回 AgentSchema + ServerSchema + schema_id

3. POST /v1/execute/:schema_id
   Body: { prompt: "a cat on the moon", size: "1024x1024" }
   → 用本地 API Key 直连 Provider
   → 执行字段映射
   → 返回标准化结果
```

### 2.2 Provider Pack Generator

**核心创新点**：不是我们手动写 Provider Pack，而是提供工具自动生成。

```bash
# 从 Provider API 文档生成 Pack
synapse pack generate \
  --name "openai" \
  --api-docs-url "https://platform.openai.com/docs/api-reference/images" \
  --base-url "https://api.openai.com/v1" \
  --auth-type "Bearer"

# 或者从 OpenAPI Spec 生成
synapse pack generate \
  --name "replicate" \
  --openapi-spec ./replicate-api.yaml

# 或者交互式生成（小模型辅助）
synapse pack generate --interactive
# → 小模型分析 API 文档，提问确认，生成 Pack
```

生成器输出：

```
@synapse-router/pack-openai/
├── provider-card.json     # Provider 能力声明
├── dsl.json               # 字段 DSL 和映射规则（自动生成）
├── adapter.ts             # Adapter 实现（调用逻辑）
├── schemas/
│   ├── generate-input.json   # 输入 Schema
│   └── generate-output.json  # 输出 Schema
└── README.md              # 自动生成的文档
```

**Phase 2 演进**：同一个生成器引擎，变成云端 Registry 的核心——用户提交 Provider API 文档，云端自动生成 Pack 并发布到 Registry。

### 2.3 Schema Negotiation

```
优先级：本地小模型 → 云端 LLM fallback → 确定性规则 fallback

1. 本地小模型（如果可用）
   - 检测本地是否有可用 LLM（ollama, lm-studio 等）
   - 有：用本地模型协商，数据不出机器
   - 无：降级到方案 2

2. 云端 LLM（fallback）
   - 只传输意图信息：{ intent, provider, desired_fields }
   - 不传输 API Key 或任何业务数据
   - 云端返回协商结果和字段映射建议

3. 确定性规则（最终 fallback）
   - 基于预定义的 Provider Pack 中的映射规则
   - 无需 LLM，直接匹配
   - 最快但最不灵活
```

### 2.4 API Key Vault

```
本地存储结构：

~/.synapse/
├── keys/
│   ├── vault.json          # 加密存储的 API Key
│   └── vault.key           # 加密密钥（用户首次设置时生成）
├── schemas/
│   └── {schema_id}/
│       ├── agent-schema.json
│       └── server-schema.json
├── packs/
│   ├── openai/
│   ├── replicate/
│   └── stability/
└── config.json             # 全局配置
```

Key 管理接口：

```bash
synapse key set openai sk-xxx          # 设置 Key（加密存储）
synapse key list                       # 列出已配置的 Provider（不显示 Key）
synapse key test openai                # 测试 Key 是否有效
synapse key remove openai              # 删除 Key
```

---

## 3. 预置 Provider Pack（Phase 1）

### Phase 1 手动创建 3 个 Pack，同时验证 Pack Generator

| Pack | Provider | 核心能力 | 状态 |
|------|----------|----------|------|
| `pack-openai` | OpenAI DALL-E / GPT-Image | text-to-image, image-edit | 手动 + Generator 验证 |
| `pack-replicate` | Replicate | text-to-image, image-to-image | 手动 + Generator 验证 |
| `pack-stability` | Stability AI | text-to-image, upscale, inpaint | 手动 + Generator 验证 |

### 每个 Pack 的标准内容

```json
// provider-card.json
{
  "provider": {
    "id": "openai",
    "name": "OpenAI Images",
    "version": "1.0.0",
    "api_version": "v1",
    "base_url": "https://api.openai.com/v1",
    "auth_type": "Bearer"
  },
  "features": [
    {
      "id": "text-to-image",
      "intent": "text-to-image",
      "name": "Text to Image",
      "description": "从文本描述生成图片",
      "input": {
        "fields": [
          { "name": "prompt", "type": "string", "required": true, "description": "图片描述" },
          { "name": "size", "type": "enum", "values": ["1024x1024","1024x1792","1792x1024"], "required": false },
          { "name": "quality", "type": "enum", "values": ["standard","hd"], "required": false },
          { "name": "model", "type": "enum", "values": ["dall-e-3","gpt-image-1"], "required": false }
        ]
      },
      "output": {
        "fields": [
          { "name": "image_url", "type": "string", "description": "图片 URL" },
          { "name": "image_base64", "type": "string", "description": "Base64 编码图片" },
          { "name": "revised_prompt", "type": "string", "description": "修订后的 prompt" }
        ]
      },
      "field_mappings": [
        {
          "provider_field": "data[0].url",
          "canonical_field": "image_url",
          "transform": "extract_url"
        },
        {
          "provider_field": "data[0].b64_json",
          "canonical_field": "image_base64",
          "transform": "passthrough"
        },
        {
          "provider_field": "data[0].revised_prompt",
          "canonical_field": "revised_prompt",
          "transform": "passthrough"
        }
      ],
      "pricing": { "model": "pay-per-use", "cost_per_request": { "standard": 0.04, "hd": 0.08 }, "currency": "USD" },
      "limits": { "max_requests_per_minute": 60 }
    }
  ]
}
```

---

## 4. Pack Generator 详解

### 4.1 输入源

| 输入源 | 优先级 | 说明 |
|--------|--------|------|
| OpenAPI/Swagger Spec | 1 | 最精确，可直接解析 |
| API 文档 URL | 2 | 小模型读取文档，提取字段 |
| 手动交互 | 3 | 交互式问答生成 |
| cURL/HTTP 录制 | 4 | 从实际请求/响应推断 |

### 4.2 生成流程

```
输入: API 文档 / OpenAPI Spec / 交互输入
  │
  ▼
┌──────────────────────┐
│ 1. 解析 API 结构      │  提取 endpoints, parameters, responses
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ 2. 识别 Features      │  将 API endpoints 映射为 Features
│    (小模型辅助)        │  理解语义：这是 text-to-image? image-edit?
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ 3. 生成字段 DSL       │  为每个 Feature 生成 input/output Schema
│    (小模型辅助)        │  生成字段映射规则
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ 4. 生成 Adapter 代码   │  基于模板生成 HTTP 调用代码
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ 5. 验证 & 输出 Pack   │  校验 Schema, 测试连通性, 输出 Pack 目录
└──────────────────────┘
```

### 4.3 Phase 1 简版 vs Phase 2 完整版

| 能力 | Phase 1 简版 | Phase 2 完整版 |
|------|-------------|---------------|
| 输入源 | OpenAPI Spec + 手动交互 | + API 文档 URL + cURL 录制 |
| Feature 识别 | 基于规则 + 小模型辅助 | 完全小模型驱动 |
| 字段 DSL | 基于模板 + 手动确认 | 自动生成 + 自动验证 |
| Adapter 代码 | 模板生成（HTTP only） | + WebSocket + SSE + 自定义 |
| 验证 | 基本连通性测试 | + 完整字段映射验证 + 回归测试 |
| 发布 | 本地目录 | 云端 Registry 发布 |
| 维护 | 手动更新 | + 自动检测 Provider API 变更 |

---

## 5. 项目结构（重构后）

```
synapse-router/
├── packages/
│   ├── core/                  # Schema 类型 + 校验 + 规范化
│   ├── negotiator/            # Schema 协商（本地/云端小模型）
│   ├── providers/             # Provider Registry + Adapter 接口
│   ├── router/                # 路由策略 + 执行引擎
│   ├── vault/                 # API Key 加密存储 [NEW]
│   └── pack-generator/        # Provider Pack 生成器 [NEW]
│
├── packs/                     # 预置 Provider Pack [NEW]
│   ├── openai/
│   ├── replicate/
│   └── stability/
│
├── apps/
│   ├── api/                   # HTTP API Server [RENAME: server → api]
│   ├── mcp/                   # MCP Server [NEW]
│   ├── cli/                   # CLI 工具 [NEW]
│   ├── playground/            # 本地 Playground
│   └── comfy-node/            # ComfyUI 集成
│
├── knowledge/                 # 知识库（已有）
│
├── package.json
└── pnpm-workspace.yaml
```

---

## 6. 开发计划

### Week 1-2：核心类型 + Pack 结构

- [ ] 重构 `packages/core`：AgentSchema / ServerSchema 类型定义
- [ ] 定义 Provider Pack 标准结构（provider-card.json + dsl.json + adapter + schemas）
- [ ] 手动创建 3 个预置 Pack（OpenAI / Replicate / Stability）
- [ ] API Key Vault 基础实现（加密存储）

### Week 3-4：API Server + 执行引擎

- [ ] `apps/api`：HTTP API Server（/v1/negotiate, /v1/execute, /v1/providers）
- [ ] `packages/router`：基于 Schema Lock 的执行引擎
- [ ] `packages/providers`：加载 Pack，匹配 Feature，执行字段映射
- [ ] 端到端测试：API Key → Negotiate → Execute → 标准化结果

### Week 5-6：Schema Negotiation + Pack Generator

- [ ] `packages/negotiator`：本地小模型检测 + 云端 LLM fallback
- [ ] `packages/pack-generator`：OpenAPI Spec 解析 + 交互式生成
- [ ] 用 Pack Generator 重新生成 3 个预置 Pack（验证 Generator）
- [ ] Schema Lock 缓存和重用

### Week 7-8：MCP Server + CLI + 打磨

- [ ] `apps/mcp`：MCP Server（封装 API Server）
- [ ] `apps/cli`：CLI 工具（key管理/negotiate/execute/pack generate）
- [ ] 完整用户流程测试
- [ ] 文档和示例
- [ ] 开源准备

---

## 7. Phase 1 的用户旅程（最终）

```bash
# 1. 安装
npm install -g @synapse-router/cli

# 2. 配置 Key
$ synapse key set openai sk-xxx
✓ Key saved (encrypted)

# 3. 查看可用 Provider
$ synapse list
  openai     ✅  key configured
  replicate  ❌  no key
  stability  ❌  no key

# 4. 查看某个 Provider 的 Feature
$ synapse inspect openai
  text-to-image  prompt → [url, revised_prompt]  $0.04-0.08
  image-edit     prompt + image → [url]           $0.04-0.08

# 5. 启动 API Server
$ synapse serve
  → Synapse Router API running at http://localhost:3000

# 6. Agent 通过 API 协商
POST http://localhost:3000/v1/negotiate
{ "intent": "text-to-image", "provider": "openai" }
→ { "schema_id": "abc123", "agent_schema": {...}, "server_schema": {...} }

# 7. Agent 通过 API 执行
POST http://localhost:3000/v1/execute/abc123
{ "prompt": "a cat on the moon" }
→ { "image_url": "https://...", "revised_prompt": "..." }

# 8. 或用 MCP Server
$ synapse mcp start
→ MCP Server on stdio, AI Agent 通过 tools/list 发现能力

# 9. 生成新的 Provider Pack
$ synapse pack generate --openapi-spec ./my-api.yaml --name "my-provider"
✓ Pack generated at ~/.synapse/packs/my-provider/
```

---

最后更新：2026-04-27
