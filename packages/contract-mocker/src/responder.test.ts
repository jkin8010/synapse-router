import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateFakeResponse } from "./responder.js";
import type { Schema } from "@synapse-router/core";

describe("generateFakeResponse", () => {
  it("generates string value in expected format", () => {
    const schema: Schema = {
      name: "test",
      fields: [{ name: "title", type: "string" }],
    };
    const result = generateFakeResponse(schema);
    assert.ok(typeof result.title === "string");
    assert.ok((result.title as string).startsWith("mock_title_"));
  });

  it("generates number value within range 0-999", () => {
    const schema: Schema = {
      name: "test",
      fields: [{ name: "count", type: "number" }],
    };
    const result = generateFakeResponse(schema);
    assert.ok(typeof result.count === "number");
    assert.ok((result.count as number) >= 0);
    assert.ok((result.count as number) <= 999);
  });

  it("generates boolean value", () => {
    const schema: Schema = {
      name: "test",
      fields: [{ name: "flag", type: "boolean" }],
    };
    const result = generateFakeResponse(schema);
    assert.ok(typeof result.flag === "boolean");
  });

  it("generates enum value from enumValues", () => {
    const schema: Schema = {
      name: "test",
      fields: [{ name: "color", type: "enum", enumValues: ["red", "green", "blue"] }],
    };
    // Run multiple times to check all values are valid
    for (let i = 0; i < 20; i++) {
      const result = generateFakeResponse(schema);
      assert.ok(["red", "green", "blue"].includes(result.color as string));
    }
  });

  it("generates image as data URL", () => {
    const schema: Schema = {
      name: "test",
      fields: [{ name: "avatar", type: "image" }],
    };
    const result = generateFakeResponse(schema);
    assert.ok(typeof result.avatar === "string");
    assert.ok((result.avatar as string).startsWith("data:image/png;base64,"));
  });

  it("includes all keys from schema fields", () => {
    const schema: Schema = {
      name: "test",
      fields: [
        { name: "a", type: "string" },
        { name: "b", type: "number" },
        { name: "c", type: "boolean" },
      ],
    };
    const result = generateFakeResponse(schema);
    assert.deepEqual(Object.keys(result).sort(), ["a", "b", "c"]);
  });
});
