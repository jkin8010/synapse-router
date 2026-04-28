# @synapse-router/negotiator

Schema 协商引擎。根据 Agent 的任务描述，自动生成匹配的 Synapse Router Schema。

## 安装

```bash
npm install @synapse-router/negotiator
```

## 快速开始

```typescript
import { negotiateSchema } from "@synapse-router/negotiator";

const result = await negotiateSchema({
  task: "image-generation",
  goal: "Generate images from text prompts",
  constraints: {
    maxFields: 5,
    preferredTypes: ["string", "number"],
  },
});

console.log(result.schema);
// {
//   name: "negotiated-schema",
//   fields: [
//     { name: "prompt", type: "string", required: true },
//     { name: "width", type: "number", required: false },
//     { name: "height", type: "number", required: false },
//     { name: "model", type: "string", required: false },
//   ]
// }

console.log(result.schema_id);
// "a3f2b8c..." (SHA-256 hash of normalized schema)
```

## 协商机制

### 三层降级策略

```
┌─────────────────────────────────┐
│  1. 云端 LLM (OpenAI Compatible)│  ← 最佳质量
│     OPENAI_API_KEY 可用时自动启用 │
├─────────────────────────────────┤
│  2. 本地小模型                    │  ← 离线可用
│     (预留扩展点)                  │
├─────────────────────────────────┤
│  3. 确定性规则                    │  ← 零依赖 fallback
│     返回最小可用 Schema            │
└─────────────────────────────────┘
```

### LLM 协商流程

1. 构造 System Prompt，约束 Schema 格式（类型、深度、字段数限制）
2. 构造 User Prompt，包含任务、目标和约束
3. LLM 返回 JSON 格式的 Schema
4. 解析 → 校验 → 规范化 → 哈希

> **LLM Prompt 约束**：
> - 字段类型仅允许 `string`, `number`, `boolean`, `enum`, `image`
> - 最多 10 个字段
> - 最大深度 2 层
> - 最多 10 个 enum 值
> - 不包含 Provider 特定参数

## API 参考

### `negotiateSchema(input, options?)`

```typescript
import { negotiateSchema, type NegotiateSchemaInput, type NegotiateSchemaOptions } from "@synapse-router/negotiator";

interface NegotiateSchemaInput {
  task: string;           // 任务描述，如 "image-generation"
  goal: string;           // 目标，如 "Generate images from text prompts"
  constraints?: any;      // 可选约束
}

interface NegotiatedSchema {
  schema: Schema;         // 生成的 Schema
  schema_id: string;      // Schema 的 SHA-256 哈希
}

const result = await negotiateSchema(input, options);
```

### Options

```typescript
interface NegotiateSchemaOptions {
  llm?: LLMClient;  // 自定义 LLM 客户端
}
```

### 自定义 LLM 客户端

```typescript
import { negotiateSchema, type LLMClient } from "@synapse-router/negotiator";

// 实现自定义 LLM 客户端
const myLLM: LLMClient = {
  async complete(messages) {
    // 调用你的 LLM API
    const response = await fetch("https://my-llm.example.com/completions", {
      method: "POST",
      body: JSON.stringify({ messages }),
    });
    const data = await response.json();
    return data.content;
  },
};

const result = await negotiateSchema(
  { task: "text-to-speech", goal: "Convert text to audio" },
  { llm: myLLM }
);
```

### `createOpenAICompatibleClient(options)`

创建兼容 OpenAI API 的 LLM 客户端：

```typescript
import { createOpenAICompatibleClient } from "@synapse-router/negotiator";

const llm = createOpenAICompatibleClient({
  apiKey: "sk-your-key",
  model: "gpt-4o-mini",                         // 默认 gpt-4o-mini
  baseUrl: "https://api.openai.com/v1",          // 默认 OpenAI
  fetch: customFetch,                            // 可选自定义 fetch
});

const result = await negotiateSchema(input, { llm });
```

### 环境变量

设置 `OPENAI_API_KEY` 后，协商引擎自动使用 OpenAI 兼容客户端，无需手动配置：

```bash
export OPENAI_API_KEY=sk-your-key
```

## 默认行为

当 `OPENAI_API_KEY` 未设置且未提供自定义 LLM 时，使用确定性 fallback：

```typescript
// Fallback 返回最小可用 Schema
{
  name: "negotiated-schema",
  fields: [
    { name: "input", type: "string", required: true }
  ]
}
```

## System Prompt

协商引擎使用的 System Prompt：

```
You are the schema negotiation component of Synapse Router.
Return only JSON for a Synapse Router Schema.
Allowed field types are string, number, boolean, enum, and image.
Use at most 10 fields, at most depth 2, and at most 10 enum values.
Do not include provider-specific API parameters or business workflow logic.
```
