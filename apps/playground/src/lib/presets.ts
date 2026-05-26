export interface SchemaPreset {
  id: string;
  name: string;
  category: "built-in" | "custom";
  intent: string;
  provider: string;
  schema: string; // JSON string of the full agent schema
  createdAt?: string;
}

const STORAGE_KEY = "synapse_playground_presets";

// 3 built-in presets: Chat, Text-to-Image, Embedding
export const BUILT_IN_PRESETS: SchemaPreset[] = [
  {
    id: "builtin-chat",
    name: "Chat",
    category: "built-in",
    intent: "chat",
    provider: "openai",
    schema: JSON.stringify(
      {
        agent_id: "chat-agent",
        agent_name: "Chat Agent",
        version: "1.0.0",
        features: [
          {
            feature_id: "chat",
            intent: "chat",
            input_schema: {
              name: "input",
              fields: [
                {
                  name: "messages",
                  type: "array",
                  required: true,
                  description: "Conversation messages (role + content)",
                },
                {
                  name: "model",
                  type: "string",
                  required: false,
                  description: "Model ID",
                  enum: ["gpt-4o", "gpt-4o-mini"],
                },
                {
                  name: "temperature",
                  type: "number",
                  required: false,
                  description: "Sampling temperature (0-2)",
                },
                {
                  name: "max_tokens",
                  type: "number",
                  required: false,
                  description: "Maximum output tokens",
                },
              ],
            },
            output_schema: {
              name: "output",
              fields: [
                { name: "choices", type: "array", description: "Model response choices" },
                { name: "usage", type: "object", description: "Token usage statistics" },
              ],
            },
          },
        ],
      },
      null,
      2,
    ),
  },
  {
    id: "builtin-text-to-image",
    name: "Text-to-Image",
    category: "built-in",
    intent: "text-to-image",
    provider: "stability",
    schema: JSON.stringify(
      {
        agent_id: "image-agent",
        agent_name: "Image Generation Agent",
        version: "1.0.0",
        features: [
          {
            feature_id: "text-to-image",
            intent: "text-to-image",
            input_schema: {
              name: "input",
              fields: [
                {
                  name: "prompt",
                  type: "string",
                  required: true,
                  description: "Image generation prompt",
                },
                {
                  name: "negative_prompt",
                  type: "string",
                  required: false,
                  description: "Negative prompt",
                },
                {
                  name: "width",
                  type: "number",
                  required: false,
                  description: "Image width (pixels)",
                },
                {
                  name: "height",
                  type: "number",
                  required: false,
                  description: "Image height (pixels)",
                },
                {
                  name: "steps",
                  type: "number",
                  required: false,
                  description: "Diffusion steps",
                },
              ],
            },
            output_schema: {
              name: "output",
              fields: [
                { name: "images", type: "array", description: "Generated image data (base64 or URL)" },
              ],
            },
          },
        ],
      },
      null,
      2,
    ),
  },
  {
    id: "builtin-embedding",
    name: "Embedding",
    category: "built-in",
    intent: "embeddings",
    provider: "openai",
    schema: JSON.stringify(
      {
        agent_id: "embedding-agent",
        agent_name: "Embedding Agent",
        version: "1.0.0",
        features: [
          {
            feature_id: "embeddings",
            intent: "embeddings",
            input_schema: {
              name: "input",
              fields: [
                {
                  name: "input",
                  type: "string",
                  required: true,
                  description: "Text to embed",
                },
                {
                  name: "model",
                  type: "string",
                  required: false,
                  description: "Embedding model",
                  enum: ["text-embedding-3-small", "text-embedding-3-large"],
                },
              ],
            },
            output_schema: {
              name: "output",
              fields: [
                { name: "data", type: "array", description: "Embedding vectors" },
                { name: "usage", type: "object", description: "Token usage" },
              ],
            },
          },
        ],
      },
      null,
      2,
    ),
  },
];

export function loadCustomPresets(): SchemaPreset[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((p: SchemaPreset) => p.category === "custom")
      : [];
  } catch {
    return [];
  }
}

export function saveCustomPreset(
  preset: Omit<SchemaPreset, "id" | "category" | "createdAt">,
): SchemaPreset[] {
  const existing = loadCustomPresets();
  const newPreset: SchemaPreset = {
    ...preset,
    id: `custom-${Date.now()}`,
    category: "custom",
    createdAt: new Date().toISOString(),
  };
  const updated = [...existing, newPreset];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function deleteCustomPreset(id: string): SchemaPreset[] {
  const existing = loadCustomPresets();
  const updated = existing.filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function getAllPresets(): SchemaPreset[] {
  return [...BUILT_IN_PRESETS, ...loadCustomPresets()];
}
