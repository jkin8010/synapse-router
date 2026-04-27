import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  hashSchema,
  normalizeSchema,
  validateSchema,
  type Schema
} from "./index.js";

describe("core DSL schema", () => {
  test("validates a simple schema", () => {
    const schema: Schema = {
      name: "route-input",
      fields: [
        { name: "prompt", type: "string", required: true },
        { name: "seed", type: "number" },
        { name: "mode", type: "enum", enumValues: ["fast", "quality"] }
      ]
    };

    assert.deepEqual(validateSchema(schema), { valid: true, errors: [] });
  });

  test("rejects schemas that exceed field, depth, and enum limits", () => {
    const schema: Schema = {
      name: "invalid",
      fields: [
        { name: "field-01", type: "string" },
        { name: "field-02", type: "string" },
        { name: "field-03", type: "string" },
        { name: "field-04", type: "string" },
        { name: "field-05", type: "string" },
        { name: "field-06", type: "string" },
        { name: "field-07", type: "string" },
        { name: "field-08", type: "string" },
        { name: "field-09", type: "string" },
        { name: "field-10", type: "string" },
        { name: "field-11", type: "string" },
        {
          name: "nested",
          type: "string",
          fields: [{ name: "child", type: "string", fields: [{ name: "too-deep", type: "string" }] }]
        },
        {
          name: "choice",
          type: "enum",
          enumValues: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]
        }
      ]
    };

    const result = validateSchema(schema);

    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /at most 10 fields/);
    assert.match(result.errors.join("\n"), /depth cannot exceed 2/);
    assert.match(result.errors.join("\n"), /enum field "choice" cannot have more than 10 values/);
  });

  test("reports unsupported runtime field types without throwing", () => {
    const schema = {
      name: "invalid-type",
      fields: [{ name: "payload", type: "object" }]
    } as unknown as Schema;

    const result = validateSchema(schema);

    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /unsupported type "object"/);
  });

  test("normalizes schemas into stable sorted order", () => {
    const schema: Schema = {
      fields: [
        { type: "enum", enumValues: ["beta", "alpha"], name: "mode" },
        { required: true, type: "string", name: "prompt" }
      ],
      name: "route-input"
    };

    assert.deepEqual(normalizeSchema(schema), {
      fields: [
        { name: "mode", type: "enum", enumValues: ["alpha", "beta"] },
        { name: "prompt", type: "string", required: true }
      ],
      name: "route-input"
    });
  });

  test("hashes equivalent schemas to the same sha256 value", () => {
    const first: Schema = {
      name: "route-input",
      fields: [
        { name: "prompt", type: "string", required: true },
        { name: "mode", type: "enum", enumValues: ["quality", "fast"] }
      ]
    };
    const second: Schema = {
      fields: [
        { enumValues: ["fast", "quality"], type: "enum", name: "mode" },
        { required: true, type: "string", name: "prompt" }
      ],
      name: "route-input"
    };

    assert.equal(hashSchema(first), hashSchema(second));
    assert.match(hashSchema(first), /^[a-f0-9]{64}$/);
  });
});
