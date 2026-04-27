import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildServer, type NegotiateSchemaHandler } from "./index.js";

describe("server API", () => {
  test("POST /negotiate calls negotiator and returns schema_id plus schema", async () => {
    const calls: Parameters<NegotiateSchemaHandler>[0][] = [];
    const server = buildServer({
      logger: false,
      negotiateSchema: async (input) => {
        calls.push(input);
        return {
          schema_id: "schema_123",
          schema: {
            name: "image-input",
            fields: [{ name: "prompt", type: "string", required: true }]
          }
        };
      }
    });

    const response = await server.inject({
      method: "POST",
      url: "/negotiate",
      payload: {
        task: "generate image",
        goal: "collect image inputs",
        constraints: { provider: "mock" }
      }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), {
      schema_id: "schema_123",
      schema: {
        name: "image-input",
        fields: [{ name: "prompt", type: "string", required: true }]
      }
    });
    assert.deepEqual(calls, [
      {
        task: "generate image",
        goal: "collect image inputs",
        constraints: { provider: "mock" }
      }
    ]);
  });

  test("POST /execute/:schema_id returns a fake image URL", async () => {
    const server = buildServer({ logger: false });

    const response = await server.inject({
      method: "POST",
      url: "/execute/schema_123",
      payload: { prompt: "a robot painting" }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), {
      schema_id: "schema_123",
      status: "mocked",
      image_url: "https://example.com/mock-images/schema_123.png"
    });
  });

  test("POST /negotiate rejects missing task or goal", async () => {
    const server = buildServer({ logger: false });

    const response = await server.inject({
      method: "POST",
      url: "/negotiate",
      payload: { task: "generate image" }
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.body, /task and goal are required/);
  });
});
