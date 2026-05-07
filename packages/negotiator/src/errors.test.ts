import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContractVerificationError } from "./errors.js";

describe("ContractVerificationError", () => {
  it("should create an error with all required fields", () => {
    const err = createContractVerificationError({
      schema_id: "abc123",
      provider_id: "openai-gpt4",
      status: "manifest_mismatch",
      retries: 0,
      suggestions: [],
    });

    assert.equal(err.schema_id, "abc123");
    assert.equal(err.provider_id, "openai-gpt4");
    assert.equal(err.status, "manifest_mismatch");
    assert.equal(err.retries, 0);
    assert.deepStrictEqual(err.suggestions, []);
    assert.equal(err.manifest_diff, undefined);
    assert.equal(err.mock_result, undefined);
  });

  it("should include manifest_diff when status is manifest_mismatch", () => {
    const err = createContractVerificationError({
      schema_id: "abc123",
      provider_id: "openai-gpt4",
      status: "manifest_mismatch",
      manifest_diff: {
        missing: ["model", "temperature"],
        extra: ["custom_field"],
        type_mismatch: [
          { field: "max_tokens", expected: "number", actual: "string" },
        ],
      },
      retries: 1,
      suggestions: ["Add required fields: model, temperature"],
    });

    assert.equal(err.status, "manifest_mismatch");
    assert.ok(err.manifest_diff);
    assert.deepStrictEqual(err.manifest_diff.missing, ["model", "temperature"]);
    assert.deepStrictEqual(err.manifest_diff.extra, ["custom_field"]);
    assert.equal(err.manifest_diff.type_mismatch.length, 1);
    assert.deepStrictEqual(err.manifest_diff.type_mismatch[0], {
      field: "max_tokens",
      expected: "number",
      actual: "string",
    });
    assert.equal(err.retries, 1);
  });

  it("should include mock_result when status is mock_failure", () => {
    const err = createContractVerificationError({
      schema_id: "abc123",
      provider_id: "openai-gpt4",
      status: "mock_failure",
      mock_result: {
        request_sent: { model: "gpt-4", messages: [] },
        response_received: { error: "invalid_request" },
        error_message: "Mock server returned 400: missing required field 'prompt'",
      },
      retries: 2,
      suggestions: ["Ensure all required fields are included in the request body"],
    });

    assert.equal(err.status, "mock_failure");
    assert.ok(err.mock_result);
    assert.deepStrictEqual(err.mock_result.request_sent, {
      model: "gpt-4",
      messages: [],
    });
    assert.deepStrictEqual(err.mock_result.response_received, {
      error: "invalid_request",
    });
    assert.equal(
      err.mock_result.error_message,
      "Mock server returned 400: missing required field 'prompt'"
    );
    assert.equal(err.retries, 2);
  });

  it("should include human-readable suggestions", () => {
    const err = createContractVerificationError({
      schema_id: "abc123",
      provider_id: "stability-ai",
      status: "timeout",
      retries: 2,
      suggestions: [
        "Mock server did not respond within 5 seconds",
        "Consider reducing the number of required fields",
        "Check if the endpoint path is correct",
      ],
    });

    assert.equal(err.status, "timeout");
    assert.equal(err.suggestions.length, 3);
    assert.ok(err.suggestions[0].includes("Mock server"));
    assert.ok(err.suggestions[1].includes("required fields"));
    assert.ok(err.suggestions[2].includes("endpoint path"));
    assert.equal(err.retries, 2);
    assert.equal(err.manifest_diff, undefined);
  });
});
