# @synapse-router/pack-generator

Provider Pack 生成器。从 OpenAPI 3.0 Spec 自动生成 Synapse Router 的 Provider Pack。

## 安装

```bash
npm install @synapse-router/pack-generator
```

## 快速开始

### 从 URL 生成

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

// 写入磁盘
await writePack("./packs/my-provider", providerCard, dslFiles);
```

### 从 OpenAPI Spec 对象生成

```typescript
import { generatePack } from "@synapse-router/pack-generator";

const openApiSpec = {
  openapi: "3.0.0",
  info: { title: "My API", version: "1.0.0" },
  servers: [{ url: "https://api.example.com/v1" }],
  paths: {
    "/images/generations": {
      post: {
        operationId: "generateImage",
        summary: "Generate Image",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  prompt: { type: "string" },
                  width: { type: "number" },
                  height: { type: "number" },
                },
                required: ["prompt"],
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    url: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

const { providerCard, dslFiles } = generatePack(openApiSpec, {
  providerId: "my-provider",
  providerName: "My Provider",
});
```

## 生成流程

```
OpenAPI Spec (JSON/YAML)
        │
        ▼
┌───────────────────────────┐
│  1. 解析 OpenAPI Spec      │
│     → 提取 paths + methods │
├───────────────────────────┤
│  2. 转换 JSON Schema → Field[]│
│     → 处理 $ref, allOf 等  │
├───────────────────────────┤
│  3. 推断 Intent + Capability│
│     → 基于 URL + operationId│
├───────────────────────────┤
│  4. 生成 Field Mappings    │
│     → 别名匹配 canonical    │
├───────────────────────────┤
│  5. 检测 Auth Type         │
│     → securitySchemes      │
├───────────────────────────┤
│  6. 输出                   │
│     → provider-card.json   │
│     → dsl/*.json           │
└───────────────────────────┘
```

## 输入源

### 1. OpenAPI Spec URL

```typescript
const result = await generatePackFromURL("https://api.example.com/openapi.json");
```

### 2. OpenAPI Spec 对象

```typescript
const spec = JSON.parse(fs.readFileSync("openapi.json", "utf8"));
const result = generatePack(spec);
```

### 3. 手动交互（CLI）

```bash
npx @synapse-router/pack-generator --from-url https://api.example.com/openapi.json
```

## API 参考

### `generatePack(openApiSpec, options?)`

从 OpenAPI Spec 对象生成 Pack。

```typescript
import { generatePack, type PackGeneratorOptions, type GeneratedPack } from "@synapse-router/pack-generator";

interface PackGeneratorOptions {
  providerId?: string;       // Provider ID，默认从 title slugify
  providerName?: string;     // Provider 名称，默认从 info.title
  apiVersion?: string;       // API 版本，默认从 info.version
  docsUrl?: string;          // 文档 URL
  authType?: "APIKey" | "Bearer" | "OAuth2";  // 认证类型，默认自动检测
  agentId?: string;          // Agent ID
  agentName?: string;        // Agent 名称
  agentVersion?: string;     // Agent 版本
}

interface GeneratedPack {
  providerCard: ProviderCard;   // Provider 核心卡片
  dslFiles: DSLFile[];          // Agent Schema DSL 文件
}
```

### `generatePackFromURL(specUrl, options?)`

从 URL 获取 OpenAPI Spec 并生成 Pack。

```typescript
const result = await generatePackFromURL(
  "https://api.example.com/openapi.json",
  { providerId: "my-provider" }
);
```

### `writePack(outputDir, providerCard, dslFiles)`

将生成的 Pack 写入磁盘。

```typescript
await writePack("./packs/my-provider", result.providerCard, result.dslFiles);
```

输出结构：

```
packs/my-provider/
├── provider-card.json           # Provider 核心卡片
└── dsl/
    ├── generate_image.json      # Agent Schema (per operation)
    └── ...
```

## Intent 推断规则

Pack Generator 根据 API 路径和 `operationId` 自动推断功能意图：

| URL Pattern              | Intent           | Capability                          |
|--------------------------|------------------|-------------------------------------|
| `/images/generations`    | `text-to-image`  | `image-generation`                  |
| `/chat/completions`      | `chat`           | `structured-output`                 |
| `/embeddings`            | `embeddings`     | `tool-calling`                      |
| `/completions`           | `text-generation`| `structured-output`                 |
| `/audio/speech`          | `text-to-speech` | `streaming`                         |
| `/audio/transcriptions`  | `speech-to-text` | `vision-input`                      |
| `/vision`                | `vision`         | `vision-input`                      |

## Field Alias 体系

生成 Field Mapping 时，自动匹配 Provider 字段到 Canonical 字段：

| Canonical      | 别名                                              |
|---------------|---------------------------------------------------|
| `prompt`      | prompt, input, text, message, content              |
| `model`       | model, engine, model_id, modelName                 |
| `temperature` | temperature, temp                                  |
| `max_tokens`  | max_tokens, maxToken, maxOutputTokens, max_completion_tokens |
| `top_p`       | top_p, topP, nucleus_sampling                      |
| `image_url`   | image_url, imageUrl, image, url, input_image       |
| `n`           | n, num_images, number_of_images, batch_size        |
| `seed`        | seed, random_seed                                  |
| `guidance_scale`| guidance_scale, guidanceScale, cfg_scale         |
| `steps`       | steps, num_steps, sampling_steps                   |
| `width`       | width, image_width                                 |
| `height`      | height, image_height                               |

## Auth Type 检测

自动从 OpenAPI `securitySchemes` 推断：

| securityScheme.type | auth_type  |
|---------------------|------------|
| `oauth2`            | `OAuth2`   |
| `http` + `bearer`   | `Bearer`   |
| `apiKey`            | `APIKey`   |
| 未定义               | `APIKey`（默认）|
