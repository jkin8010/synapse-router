import type { AgentSchema } from "../../packages/core/src/index.ts";

export const CHAT_AGENT_SCHEMA: AgentSchema = {
  agent_id: "e2e-test-agent",
  agent_name: "E2E Test Agent",
  version: "1.0.0",
  access_protocol: {
    kind: "api",
    auth_type: "Bearer",
  },
  features: [
    {
      feature_id: "chat-v1",
      feature_name: "Chat",
      intent: "chat",
      input_schema: {
        name: "ChatInput",
        fields: [
          { name: "messages", type: "string", required: true },
          { name: "model", type: "string", required: true },
        ],
      },
      output_schema: {
        name: "ChatOutput",
        fields: [
          { name: "response", type: "string", required: true },
        ],
      },
      capabilities: [{ kind: "tool-calling", modalities: ["text"] }],
    },
  ],
};

export const NEGOTIATE_AND_VERIFY_INPUT = {
  task: "generate chat response",
  goal: "reply to user query",
  constraints: {},
  providerId: "openai",
  lang: "typescript" as const,
};

export const CONNECT_CLI_ARGS: string[] = [
  "openai",
  "chat",
  "--input",
  '{"messages":[{"role":"user","content":"hello"}],"model":"gpt-4"}',
  "--base-url",
  "http://localhost:9876",
  "--api-key",
  "sk-placeholder",
];
