---
sidebar_position: 11
title: Pack Development Guide
---

{/* This file is derived from docs/PACKS.md in the project root. Edit the source and re-copy for significant changes. */}

# Provider Pack Development Guide

Provider Pack is the core abstraction of Synapse Router — one Pack per Provider, declaring its capabilities, field mappings, pricing, and rate limit information. The Pack enables the Router to automatically match Agent requirements with Provider capabilities.

## Pack Directory Structure

```
packs/<provider-id>/
├── provider-card.json    # Provider core card (identity + service configuration + feature declaration)
└── dsl/                  # Agent Schema DSL files (one per Feature)
    ├── feature_id_1.json
    ├── feature_id_2.json
    └── ...
```

### File Responsibilities

| File | Responsibility | Required |
|------|------|------|
| `provider-card.json` | Defines Provider identity, Service configuration, Feature list, Field Mappings, pricing, rate limits | ✅ |
| `dsl/<feature-id>.json` | Agent Schema for a single Feature, used by the negotiation engine for matching | ✅ |

## provider-card.json Complete Field Reference

`provider-card.json` consists of three top-level objects: `provider`, `service`, and `features`.

### provider (Identity)

Defines the Provider's unique identity and basic information.

| Field | Type | Required | Description | Example |
|------|------|------|------|------|
| `id` | string | ✅ | Provider unique identifier (lowercase letters, digits, and hyphens) | `"openai"` |
| `name` | string | ✅ | Provider display name | `"OpenAI"` |
| `docs_url` | string | ✅ | Official API documentation URL | `"https://platform.openai.com/docs/api-reference"` |

### service (Service Configuration)

Defines the Provider service's operational parameters.

| Field | Type | Required | Description | Example |
|------|------|------|------|------|
| `id` | string | ✅ | Service identifier, typically matches `provider.id` | `"openai"` |
| `name` | string | ✅ | Service display name | `"OpenAI"` |
| `version` | string | ✅ | Pack version number (SemVer) | `"1.0.0"` |
| `api_version` | string | ✅ | Provider API version | `"2024-01-01"` |
| `base_url` | string | ✅ | API base URL | `"https://api.openai.com/v1"` |
| `auth_type` | string | ✅ | Authentication type: `Bearer` / `APIKey` / `OAuth2` | `"Bearer"` |

### features (Feature Declaration)

Declares each feature provided by the Provider.

| Field | Type | Required | Description |
|------|------|------|------|
| `id` | string | ✅ | Feature unique identifier, typically corresponds to the API operation |
| `intent` | string | ✅ | Intent type, used for negotiation matching (e.g., `chat`, `text-to-image`) |
| `name` | string | ✅ | Feature display name |
| `description` | string | ✅ | Feature description |
| `input` | object | ✅ | Input parameter definition (see input structure below) |
| `output` | object | ✅ | Output parameter definition (see output structure below) |
| `field_mappings` | array | ✅ | Mapping from canonical fields to Provider fields (see mapping structure below) |
| `pricing` | object | ❌ | Pricing information |
| `limits` | object | ❌ | Rate limit information |

#### input / output structure

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

**Field types:** `string` | `number` | `boolean` | `array` | `object`

Optional attributes:

| Attribute | Type | Description |
|------|------|------|
| `required` | boolean | Whether the field is required |
| `description` | string | Field description |
| `enum` | string[] | List of enum values |

#### field_mappings structure

Maps canonical fields from the Agent Schema to the Provider's actual fields.

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

| Field | Type | Required | Description |
|------|------|------|------|
| `canonical_field` | string | ✅ | Canonical field name (Router internal standard) |
| `provider_field` | string | ✅ | Actual field name in the Provider API |
| `required` | boolean | ✅ | Whether this mapping is required |
| `fallback` | any | ❌ | Default value (used when the Agent does not provide a value) |
| `transform` | string | ❌ | Data transformation method (e.g., `base64_decode`, `passthrough`) |

#### pricing structure

```json
{
  "pricing": {
    "input": 0.0015,
    "output": 0.002,
    "unit": "1k tokens"
  }
}
```

#### limits structure

```json
{
  "limits": {
    "rpm": 500,
    "tpm": 150000
  }
}
```

| Field | Type | Description |
|------|------|------|
| `rpm` | number | Requests per minute limit |
| `tpm` | number | Tokens per minute limit (optional) |

### Complete Example

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

## DSL File Format

Each Feature has a corresponding Agent Schema DSL file stored at `dsl/<feature-id>.json`.

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

### DSL Key Fields

| Field | Description |
|------|------|
| `agent_id` | Agent unique identifier |
| `agent_name` | Agent display name |
| `version` | Agent version |
| `access_protocol.kind` | Access protocol type (`api`/`mcp`) |
| `access_protocol.auth_type` | Authentication type |
| `features[].feature_id` | Feature unique identifier, must match the `id` in provider-card.json |
| `features[].intent` | Intent type, used for matching during negotiation |
| `features[].input_schema` | Input parameter Schema |
| `features[].output_schema` | Output parameter Schema |
| `features[].field_mappings` | Field mappings |
| `features[].capabilities` | Capability declaration |

## How to Manually Create a Pack

### Step 1: Create the Directory

```bash
mkdir -p packs/my-provider/dsl
```

### Step 2: Write provider-card.json

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

### Step 3: Write the DSL File

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

## How to Auto-Generate with synapse generate

The Pack Generator automatically creates a Provider Pack from an OpenAPI 3.0 Spec, eliminating the need for manual authoring.

### CLI Method

```bash
npx @synapse-router/pack-generator --from-url https://api.example.com/openapi.json
```

### Programmatic Method

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

### Generation Pipeline

```
OpenAPI Spec
    │
    ▼
1. Parse paths + methods
2. JSON Schema → Field[] (handle $ref, allOf, etc.)
3. Infer Intent + Capability (based on URL and operationId)
4. Generate Field Mappings (alias matching against canonical fields)
5. Detect Auth Type (from securitySchemes)
6. Output provider-card.json + dsl/*.json
```

### Intent Inference Rules

| URL Pattern | Intent | Capability |
|-------------|--------|------------|
| `/images/generations` | `text-to-image` | `image-generation` |
| `/chat/completions` | `chat` | `structured-output` |
| `/embeddings` | `embeddings` | `tool-calling` |
| `/audio/transcriptions` | `speech-to-text` | `vision-input` |

### Field Alias System

Automatic matching when generating Field Mappings:

| Canonical Field | Matching Aliases |
|-----------------|-----------|
| `prompt` | prompt, input, text, message, content |
| `model` | model, engine, model_id, modelName |
| `width` | width, image_width |
| `height` | height, image_height |
| `image_url` | image_url, imageUrl, image, url |

## Pack Validation Process

### Programmatic Validation

```typescript
import { validateProviderCard } from "@synapse-router/providers";
import * as fs from "fs";

const card = JSON.parse(
  fs.readFileSync("packs/my-provider/provider-card.json", "utf8")
);

const result = validateProviderCard(card);

if (!result.valid) {
  console.error("Pack validation failed:", result.errors);
  process.exit(1);
} else {
  console.log("✓ Pack format is valid");
}
```

### Validation Requirements

#### provider object
- `id`: Non-empty string, lowercase letters + digits + hyphens
- `name`: Non-empty string
- `docs_url`: Valid URL

#### service object
- `id`: Non-empty string
- `name`: Non-empty string
- `version`: Valid SemVer format
- `api_version`: Non-empty string
- `base_url`: Valid URL
- `auth_type`: Must be `Bearer`, `APIKey`, or `OAuth2`

#### features array
- Must contain at least one Feature
- Each Feature must have `id`, `intent`, `name`, `description`
- `input.fields` and `output.fields` must be non-empty arrays
- `field_mappings` must be a non-empty array

#### DSL Files
- Filename must match the corresponding Feature's `id`
- `feature_id` must match the Feature `id` in provider-card.json
- `intent` must match

### Running the Full Test Suite

```bash
pnpm test
# Ensures all Packs (built-in + custom) pass validation
```
