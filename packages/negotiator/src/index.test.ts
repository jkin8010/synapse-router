import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { hashSchema, type Schema } from "@synapse-router/core";

import {
  createOpenAICompatibleClient,
  negotiateSchema,
  type LLMClient,
  type LLMMessage
} from "./index.js";

describe("negotiateSchema", () => {
  test("prompts an injected LLM, parses JSON, validates, normalizes, and hashes the schema", async () => {
    const calls: LLMMessage[][] = [];
    const llm: LLMClient = {
      async complete(messages) {
        calls.push(messages);
        return JSON.stringify({
          name: "image-route",
          fields: [
            { type: "enum", enumValues: ["png", "jpeg"], name: "format" },
            { required: true, type: "string", name: "prompt" }
          ]
        });
      }
    };

    const result = await negotiateSchema(
      {
        task: "generate image",
        goal: "collect inputs for an image provider",
        constraints: { formats: ["jpeg", "png"] }
      },
      { llm }
    );

    const expectedSchema: Schema = {
      fields: [
        { name: "format", type: "enum", enumValues: ["jpeg", "png"] },
        { name: "prompt", type: "string", required: true }
      ],
      name: "image-route"
    };

    assert.equal(calls.length, 1);
    assert.equal(calls[0][0]?.role, "system");
    assert.match(calls[0][0]?.content ?? "", /schema negotiation/i);
    assert.equal(calls[0][1]?.role, "user");
    assert.match(calls[0][1]?.content ?? "", /generate image/);
    assert.deepEqual(result, {
      schema: expectedSchema,
      schema_id: hashSchema(expectedSchema)
    });
  });

  test("accepts JSON wrapped in markdown fences", async () => {
    const llm: LLMClient = {
      async complete() {
        return [
          "```json",
          JSON.stringify({ name: "route", fields: [{ name: "prompt", type: "string" }] }),
          "```"
        ].join("\n");
      }
    };

    const result = await negotiateSchema({ task: "caption", goal: "collect caption input" }, { llm });

    assert.equal(result.schema.name, "route");
    assert.equal(result.schema_id.length, 64);
  });

  test("rejects invalid LLM schemas with validation errors", async () => {
    const llm: LLMClient = {
      async complete() {
        return JSON.stringify({
          name: "invalid",
          fields: [{ name: "mode", type: "enum", enumValues: [] }]
        });
      }
    };

    await assert.rejects(
      negotiateSchema({ task: "route", goal: "invalid enum" }, { llm }),
      /LLM returned invalid schema/
    );
  });

  test("OpenAI-compatible client sends system and user prompts to chat completions", async () => {
    const requests: unknown[] = [];
    const client = createOpenAICompatibleClient({
      apiKey: "test-key",
      fetch: async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ name: "route", fields: [] }) } }]
          }),
          { status: 200 }
        );
      }
    });

    await client.complete([
      { role: "system", content: "system prompt" },
      { role: "user", content: "user prompt" }
    ]);

    assert.deepEqual(requests, [
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "system prompt" },
          { role: "user", content: "user prompt" }
        ],
        temperature: 0,
        response_format: { type: "json_object" }
      }
    ]);
  });
});
