# Provider Packs

Provider Pack 是 Synapse Router 的核心抽象——每个 Provider 一个 Pack，声明其能力、字段映射和定价信息。

## Pack 结构

```
packs/<provider-id>/
├── provider-card.json    # Provider 核心卡片
└── dsl/                  # Agent Schema DSL 文件（每个 feature 一个）
    ├── chat_post_v1_chat_completions.json
    ├── embeddings_post_v1_embeddings.json
    └── ...
```

### provider-card.json

核心卡片，声明 Provider 信息和所有功能：

```json
{
  "provider": {
    "id": "openai",
    "name": "OpenAI",
    "version": "1.0.0",
    "api_version": "2024-01-01",
    "base_url": "https://api.openai.com/v1",
    "auth_type": "Bearer",
    "docs_url": "https://platform.openai.com/docs/api-reference"
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

### dsl/ 目录

每个功能对应一个 Agent Schema JSON 文件，供协商引擎使用。

## 预置 Pack 列表

| Provider         | ID          | 功能                                                                    | Auth Type |
|-----------------|-------------|------------------------------------------------------------------------|-----------|
| **OpenAI**       | `openai`    | Chat Completions, Embeddings, Audio Transcriptions, Image Generations  | `Bearer`  |
| **Replicate**    | `replicate` | Predictions, Trainings                                                 | `Bearer`  |
| **Stability AI** | `stability` | Text to Image, Image to Image                                          | `APIKey`  |
| **ComfyUI**      | `comfyui`   | Workflow (post_v1_prompt)                                              | `APIKey`  |

### OpenAI 功能详情

| Feature ID                          | Intent              | 说明             |
|-------------------------------------|---------------------|-----------------|
| `chat_post_v1_chat_completions`     | `chat`              | 对话补全         |
| `embeddings_post_v1_embeddings`     | `embeddings`        | 文本向量化       |
| `audio_transcriptions_post_v1_audio_transcriptions` | `audio-transcriptions` | 语音转文字 |
| `image_generations_post_v1_images_generations` | `image-generations` | 图片生成    |

### Replicate 功能详情

| Feature ID      | Intent        | 说明            |
|-----------------|---------------|----------------|
| `predictions`   | `predictions` | 模型推理        |
| `trainings`     | `trainings`   | 模型训练        |

### Stability AI 功能详情

| Feature ID                              | Intent          | 说明            |
|-----------------------------------------|-----------------|----------------|
| `text_to_image_post_v1_generation_text2img` | `text-to-image` | 文本生成图片    |
| `image_to_image_post_v1_generation_img2img` | `image-to-image` | 图片生成图片   |

### ComfyUI 功能详情

| Feature ID              | Intent     | 说明              |
|-------------------------|------------|-------------------|
| `workflow_post_v1_prompt` | `workflow` | ComfyUI 工作流执行 |

## 创建新 Pack

### 方法一：使用 Pack Generator（推荐）

从 OpenAPI Spec 自动生成：

```typescript
import { generatePackFromURL, writePack } from "@synapse-router/pack-generator";

const { providerCard, dslFiles } = await generatePackFromURL(
  "https://api.your-service.com/openapi.json",
  {
    providerId: "your-service",
    providerName: "Your Service",
    authType: "Bearer",
  }
);

await writePack("./packs/your-service", providerCard, dslFiles);
```

### 方法二：手动创建

1. 创建目录：`mkdir -p packs/my-provider/dsl`
2. 编写 `provider-card.json`
3. 为每个 feature 编写 `dsl/<feature-id>.json`

#### Provider Card 模板

```json
{
  "provider": {
    "id": "my-provider",
    "name": "My Provider",
    "version": "1.0.0",
    "api_version": "v1",
    "base_url": "https://api.my-provider.com/v1",
    "auth_type": "APIKey",
    "docs_url": "https://docs.my-provider.com"
  },
  "features": [
    {
      "id": "my-feature",
      "intent": "text-to-image",
      "name": "My Feature",
      "description": "What this feature does",
      "input": {
        "name": "MyFeatureInput",
        "fields": [
          { "name": "prompt", "type": "string", "required": true },
          { "name": "width", "type": "number", "required": false },
          { "name": "height", "type": "number", "required": false }
        ]
      },
      "output": {
        "name": "MyFeatureOutput",
        "fields": [
          { "name": "image_url", "type": "string" }
        ]
      },
      "field_mappings": [
        { "canonical_field": "prompt", "provider_field": "prompt", "required": true },
        { "canonical_field": "width", "provider_field": "width", "required": false },
        { "canonical_field": "height", "provider_field": "height", "required": false }
      ],
      "pricing": { "per_image": 0.03, "currency": "USD" },
      "limits": { "rpm": 60 }
    }
  ]
}
```

#### 字段映射最佳实践

- `canonical_field` 使用语义化标准名称（参考 `@synapse-router/pack-generator` 的 Field Alias 体系）
- 为可选字段提供 `fallback` 默认值
- 声明 `transform` 当 Provider 字段需要格式转换时

```json
{
  "canonical_field": "prompt",
  "provider_field": "text_prompts",
  "transform": "passthrough",
  "required": true
}
```

### 方法三：CLI 生成

```bash
npx @synapse-router/pack-generator --from-url https://api.example.com/openapi.json
```

## Pack 验证

确保 Pack 格式正确：

```typescript
import { validateSpec } from "@synapse-router/providers";

const spec = JSON.parse(fs.readFileSync("packs/my-provider/spec.json", "utf8"));
const result = validateSpec(spec);

if (!result.valid) {
  console.error("Invalid spec:", result.errors);
}
```

Provider Spec 校验要求：

- `name`: 非空字符串
- `version`: 非空字符串
- `docs`: 非空字符串
- `capabilities.tasks`: 非空字符串数组
- `capabilities.modalities`: 非空字符串数组
- `capabilities.structured_output`: boolean
- `pricing`: 非空对象
- `limits`: 非空对象
- `performance.latency`: `cheap` / `fast` / `quality`
- `performance.reliability`: `low` / `medium` / `high`
