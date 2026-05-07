import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Schema } from "@synapse-router/core";
import type {
  ManifestFieldMismatch,
  MockResult,
} from "./types.js";
import type { ContractVerificationError } from "./errors.js";
import {
  buildFeedbackPrompt,
  MAX_RETRIES,
  retryWithFeedback,
  type RetryableError,
} from "./retry.js";
import type { NegotiateAndVerifyInput } from "./verifier.js";

// ─── buildFeedbackPrompt tests ──────────────────────────────────────────

describe("buildFeedbackPrompt", () => {
  it("should generate missing fields prompt for manifest_mismatch", () => {
    const error: RetryableError = {
      type: "manifest_mismatch",
      missing: ["model", "max_tokens"],
      extra: [],
      type_mismatch: [],
    };

    const prompt = buildFeedbackPrompt(error);

    assert.strictEqual(prompt.type, "manifest_mismatch");
    assert.ok(typeof prompt.message === "string");
    assert.ok((prompt.message as string).includes("manifest constraints"));
    assert.deepStrictEqual(prompt.previous_missing, ["model", "max_tokens"]);
    assert.deepStrictEqual(prompt.previous_extra, []);
    assert.deepStrictEqual(prompt.previous_type_mismatch, []);
  });

  it("should include type mismatches in manifest_mismatch prompt", () => {
    const type_mismatch: ManifestFieldMismatch[] = [
      { field: "temperature", expected: "number", actual: "string" },
      { field: "max_tokens", expected: "number", actual: "boolean" },
    ];
    const error: RetryableError = {
      type: "manifest_mismatch",
      type_mismatch,
    };

    const prompt = buildFeedbackPrompt(error);

    assert.strictEqual(prompt.type, "manifest_mismatch");
    assert.deepStrictEqual(prompt.previous_type_mismatch, [
      { field: "temperature", expected: "number", actual: "string" },
      { field: "max_tokens", expected: "number", actual: "boolean" },
    ]);
    assert.deepStrictEqual(prompt.previous_missing, []);
  });

  it("should generate error_message prompt for mock_failure", () => {
    const mock_result: MockResult = {
      request_sent: { prompt: "test_prompt" },
      response_received: { error: "Mock validation failed" },
      error_message: "HTTP 422",
    };
    const error: RetryableError = {
      type: "mock_failure",
      mock_result,
    };

    const prompt = buildFeedbackPrompt(error);

    assert.strictEqual(prompt.type, "mock_failure");
    assert.ok(typeof prompt.message === "string");
    assert.ok((prompt.message as string).includes("mock testing"));
    assert.deepStrictEqual(prompt.previous_request, mock_result.request_sent);
    assert.deepStrictEqual(prompt.previous_response, mock_result.response_received);
    assert.strictEqual(prompt.previous_error, "HTTP 422");
  });

  it("should handle mock_failure with null response", () => {
    const mock_result: MockResult = {
      request_sent: { prompt: "test" },
      response_received: null,
      error_message: "Connection refused",
    };
    const error: RetryableError = {
      type: "mock_failure",
      mock_result,
    };

    const prompt = buildFeedbackPrompt(error);

    assert.strictEqual(prompt.previous_response, null);
    assert.strictEqual(prompt.previous_error, "Connection refused");
  });
});

// ─── retryWithFeedback tests ─────────────────────────────────────────────

function makeInput(overrides: Partial<NegotiateAndVerifyInput> = {}): NegotiateAndVerifyInput {
  return {
    task: "test task",
    goal: "test goal",
    providerId: "test-provider",
    packDir: "/tmp/nonexistent-pack",
    ...overrides,
  };
}

describe("retryWithFeedback", () => {
  it("should throw ContractVerificationError on attempt >= MAX_RETRIES", async () => {
    const input = makeInput();
    const error: RetryableError = {
      type: "manifest_mismatch",
      missing: ["model"],
    };

    await assert.rejects(
      () => retryWithFeedback(input, error, MAX_RETRIES),
      (err: unknown) => {
        const ce = err as ContractVerificationError;
        return (
          ce !== null &&
          typeof ce === "object" &&
          typeof (ce as ContractVerificationError).schema_id === "string" &&
          typeof (ce as ContractVerificationError).provider_id === "string" &&
          typeof (ce as ContractVerificationError).status === "string" &&
          typeof (ce as ContractVerificationError).retries === "number" &&
          Array.isArray((ce as ContractVerificationError).suggestions)
        );
      }
    );
  });

  it("should include suggestions when throwing ContractVerificationError", async () => {
    const input = makeInput();
    const error: RetryableError = {
      type: "manifest_mismatch",
      missing: ["model", "max_tokens"],
      type_mismatch: [
        { field: "temperature", expected: "number", actual: "string" },
      ],
    };

    let caught: ContractVerificationError | null = null;
    try {
      await retryWithFeedback(input, error, MAX_RETRIES);
    } catch (err) {
      caught = err as ContractVerificationError;
    }

    assert.ok(caught !== null);
    assert.strictEqual(caught!.retries, MAX_RETRIES);
    assert.strictEqual(caught!.status, "manifest_mismatch");
    assert.strictEqual(caught!.provider_id, "test-provider");
    assert.ok(caught!.suggestions.length >= 1);
    assert.ok(
      caught!.suggestions.some((s) => s.includes("model") && s.includes("max_tokens"))
    );
    assert.ok(
      caught!.suggestions.some((s) => s.includes("temperature"))
    );
    assert.ok(caught!.manifest_diff !== undefined);
    assert.deepStrictEqual(caught!.manifest_diff?.missing, ["model", "max_tokens"]);
  });

  it("should include mock_failure suggestions in ContractVerificationError", async () => {
    const input = makeInput();
    const error: RetryableError = {
      type: "mock_failure",
      mock_result: {
        request_sent: { prompt: "test" },
        response_received: null,
        error_message: "Connection refused",
      },
    };

    let caught: ContractVerificationError | null = null;
    try {
      await retryWithFeedback(input, error, MAX_RETRIES);
    } catch (err) {
      caught = err as ContractVerificationError;
    }

    assert.ok(caught !== null);
    assert.strictEqual(caught!.status, "mock_failure");
    assert.strictEqual(caught!.retries, MAX_RETRIES);
    assert.ok(caught!.suggestions.length >= 1);
    assert.ok(caught!.suggestions.some((s) => s.includes("Mock test failed")));
    assert.ok(caught!.mock_result !== undefined);
    assert.strictEqual(caught!.mock_result?.error_message, "Connection refused");
  });

  it("should re-negotiate schema and pass when manifest matches on attempt 1", async () => {
    // Create a temporary pack with valid manifest constraints
    const tmpDir = await mkdtemp(join(tmpdir(), "synapse-retry-test-"));
    const dslDir = join(tmpDir, "dsl");

    try {
      await mkdir(dslDir, { recursive: true });

      // Default LLM (no API key) returns:
      // { name: "negotiated-schema", fields: [{ name: "input", type: "string", required: true }] }
      // We create a manifest that requires "input" as string — it should pass.
      const dslContent = {
        features: [
          {
            feature_id: "test_feature",
            constraints: {
              required: ["input"],
              type: { input: "string" },
            },
          },
        ],
      };
      await writeFile(
        join(dslDir, "test_feature.json"),
        JSON.stringify(dslContent),
        "utf8"
      );

      // provider-card.json required by generateSdk
      const providerCard = {
        provider: { id: "test-provider", name: "Test Provider", docs_url: "https://example.com" },
        service: { id: "test", name: "Test Service", version: "1.0.0", api_version: "v1", base_url: "https://api.test.com", auth_type: "Bearer" },
        features: [
          {
            id: "test_feature",
            intent: "test",
            name: "Test Feature",
            description: "A test feature",
            input: { name: "input", fields: [{ name: "input", type: "string", required: true }] },
            output: { name: "output", fields: [{ name: "result", type: "string" }] },
            field_mappings: [],
          },
        ],
      };
      await writeFile(
        join(tmpDir, "provider-card.json"),
        JSON.stringify(providerCard),
        "utf8"
      );

      const input = makeInput({ packDir: tmpDir });
      const error: RetryableError = {
        type: "manifest_mismatch",
        missing: ["input"],
      };

      // On attempt 0 (below MAX_RETRIES), it re-negotiates with feedback.
      // The default LLM returns a schema that matches our manifest.
      const result = await retryWithFeedback(input, error, 0);

      assert.ok(result !== null);
      assert.strictEqual(typeof result.schema, "object");
      assert.strictEqual(typeof result.schema_id, "string");
      assert.strictEqual(typeof result.sdk_code, "string");
      assert.ok(result.sdk_code.length > 0);
      assert.deepStrictEqual(result.verification_result, {
        status: "passed",
        verified_at: result.verification_result.verified_at,
      });
      assert.strictEqual(typeof result.verification_result.verified_at, "string");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
