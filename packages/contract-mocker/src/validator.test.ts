import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateRequestBody } from "./validator.js";
import type { Schema } from "@synapse-router/core";

describe("validateRequestBody", () => {
  const schema: Schema = {
    name: "test",
    fields: [
      { name: "name", type: "string", required: true },
      { name: "age", type: "number", required: true },
      { name: "active", type: "boolean" },
      { name: "color", type: "enum", enumValues: ["red", "green", "blue"] },
    ],
  };

  it("returns valid for a fully matching body", () => {
    const result = validateRequestBody(schema, {
      name: "Alice",
      age: 30,
      active: true,
      color: "blue",
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("detects missing required fields", () => {
    const result = validateRequestBody(schema, {
      name: "Alice",
      // missing age
      active: true,
    });
    assert.equal(result.valid, false);
    const missingAge = result.errors.find(
      (e) => e.field === "age" && e.code === "missing_required"
    );
    assert.ok(missingAge, "Expected missing_required error for 'age'");
  });

  it("detects type mismatch", () => {
    const result = validateRequestBody(schema, {
      name: "Alice",
      age: "thirty", // should be number
      active: true,
    });
    assert.equal(result.valid, false);
    const typeError = result.errors.find(
      (e) => e.field === "age" && e.code === "type_mismatch"
    );
    assert.ok(typeError, "Expected type_mismatch error for 'age'");
  });

  it("detects unknown fields", () => {
    const result = validateRequestBody(schema, {
      name: "Alice",
      age: 30,
      active: true,
      unknown_field: "surprise",
    });
    assert.equal(result.valid, false);
    const unknownError = result.errors.find(
      (e) => e.field === "unknown_field" && e.code === "unknown_field"
    );
    assert.ok(unknownError, "Expected unknown_field error");
  });

  it("returns valid for empty body when no fields are required", () => {
    const optionalSchema: Schema = {
      name: "test-optional",
      fields: [
        { name: "nickname", type: "string" },
        { name: "tag", type: "number" },
      ],
    };
    const result = validateRequestBody(optionalSchema, {});
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("handles null body gracefully treating it as empty object", () => {
    const result = validateRequestBody(schema, null);
    assert.equal(result.valid, false);
    const errors = result.errors.map((e) => e.code);
    assert.ok(errors.includes("missing_required"));
  });
});
