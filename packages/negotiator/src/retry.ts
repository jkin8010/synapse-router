// ─── D-12: Retry Logic with Structured Error Feedback ────────────────────

import { negotiateSchema, createOpenAICompatibleClient } from "./index.js";
import {
  loadManifestFromPack,
  matchManifest,
  buildSuggestions,
} from "./manifest.js";
import { createContractVerificationError } from "./errors.js";
import type { ContractVerificationError } from "./errors.js";
import type {
  ManifestConstraint,
  ManifestMatchResult,
  ManifestFieldMismatch,
  MockResult,
  VerificationResult,
} from "./types.js";
import type { Schema } from "@synapse-router/core";
import { MockServer } from "@synapse-router/contract-mocker";
import { generateSdk } from "@synapse-router/sdk-generator";
import type {
  NegotiateAndVerifyInput,
  NegotiationResult,
} from "./verifier.js";

// ─── Constants ───────────────────────────────────────────────────────────

/** Maximum retry attempts. Hard-coded for DoS prevention (T-03-02). */
export const MAX_RETRIES = 2;

// ─── RetryableError ──────────────────────────────────────────────────────

export interface RetryableError {
  type: "manifest_mismatch" | "mock_failure";
  missing?: string[];
  extra?: string[];
  type_mismatch?: ManifestFieldMismatch[];
  mock_result?: MockResult;
}

// ─── buildFeedbackPrompt ─────────────────────────────────────────────────

/**
 * Build a structured feedback prompt for the LLM.
 *
 * - manifest_mismatch: includes previous_missing, previous_type_mismatch,
 *   and human-readable message so the LLM knows what fields/types to fix.
 * - mock_failure: includes previous_request and previous_response so the
 *   LLM can adjust the schema to match actual provider behavior.
 *
 * The returned object is injected as `constraints._verification_feedback`
 * into the next negotiateSchema call. Only field names and types are
 * exposed — no sensitive data (T-03-03).
 */
export function buildFeedbackPrompt(
  error: RetryableError
): Record<string, unknown> {
  if (error.type === "manifest_mismatch") {
    return {
      type: "manifest_mismatch",
      message:
        "The previously negotiated schema did not match the provider manifest constraints. " +
        "Please adjust the schema to satisfy these constraints.",
      previous_missing: error.missing ?? [],
      previous_extra: error.extra ?? [],
      previous_type_mismatch: (error.type_mismatch ?? []).map((m) => ({
        field: m.field,
        expected: m.expected,
        actual: m.actual,
      })),
    };
  }

  // mock_failure
  return {
    type: "mock_failure",
    message:
      "The previously negotiated schema failed mock testing against the provider. " +
      "The request was sent to a mock server that validates against the declared schema. " +
      "Please adjust the schema to produce a request that passes validation.",
    previous_request: error.mock_result?.request_sent ?? null,
    previous_response: error.mock_result?.response_received ?? null,
    previous_error: error.mock_result?.error_message ?? "",
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────

function mergeConstraints(constraints: ManifestConstraint[]): ManifestConstraint {
  const merged: ManifestConstraint = {};
  const requiredSet = new Set<string>();
  const typeMap: Record<string, string> = {};
  const enumMap: Record<string, string[]> = {};
  const minLengthMap: Record<string, number> = {};
  const maxLengthMap: Record<string, number> = {};

  for (const c of constraints) {
    for (const r of c.required ?? []) requiredSet.add(r);
    if (c.type) Object.assign(typeMap, c.type);
    if (c.enum) Object.assign(enumMap, c.enum);
    if (c.minLength) Object.assign(minLengthMap, c.minLength);
    if (c.maxLength) Object.assign(maxLengthMap, c.maxLength);
  }

  merged.required = [...requiredSet];
  if (Object.keys(typeMap).length > 0) merged.type = typeMap;
  if (Object.keys(enumMap).length > 0) merged.enum = enumMap;
  if (Object.keys(minLengthMap).length > 0) merged.minLength = minLengthMap;
  if (Object.keys(maxLengthMap).length > 0) merged.maxLength = maxLengthMap;

  return merged;
}

async function runMockTestInRetry(
  schema: Schema,
  _packDir: string,
  _providerId: string
): Promise<{ passed: boolean; mockResult: MockResult }> {
  const server = new MockServer({ schema, endpoint: "/", method: "POST" });
  const requestBody: Record<string, unknown> = {};
  for (const field of schema.fields) {
    if (field.required) {
      if (field.type === "enum" && field.enumValues && field.enumValues.length > 0) {
        requestBody[field.name] = field.enumValues[0];
      } else {
        requestBody[field.name] = `test_${field.name}`;
      }
    }
  }

  try {
    const port = await server.start();
    const url = `http://localhost:${port}/`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const responseBody = await response.json();
    await server.stop();

    if (response.ok) {
      return {
        passed: true,
        mockResult: {
          request_sent: requestBody,
          response_received: responseBody,
          error_message: "",
        },
      };
    }

    return {
      passed: false,
      mockResult: {
        request_sent: requestBody,
        response_received: responseBody,
        error_message: `HTTP ${response.status}`,
      },
    };
  } catch (err) {
    return {
      passed: false,
      mockResult: {
        request_sent: requestBody,
        response_received: null,
        error_message: err instanceof Error ? err.message : "Unknown",
      },
    };
  } finally {
    try {
      await server.stop();
    } catch {
      // Server already stopped
    }
  }
}

// ─── retryWithFeedback ───────────────────────────────────────────────────

/**
 * Retry schema negotiation with structured feedback injected into the
 * LLM prompt.
 *
 * On each retry:
 * 1. Build a feedback prompt describing why the previous attempt failed
 * 2. Re-negotiate the schema with `_verification_feedback` injected
 *    into the constraints
 * 3. Re-run manifest matching and mock testing on the new schema
 * 4. If verification passes, return the NegotiationResult
 * 5. If verification fails, recursively retry with attempt + 1
 *
 * After MAX_RETRIES failed attempts, throws ContractVerificationError
 * with accumulated suggestions.
 */
export async function retryWithFeedback(
  input: NegotiateAndVerifyInput,
  error: RetryableError,
  attempt: number
): Promise<NegotiationResult> {
  if (attempt >= MAX_RETRIES) {
    // Build suggestions from the last error
    const suggestions: string[] = [];
    if (error.type === "manifest_mismatch") {
      if (error.missing && error.missing.length > 0) {
        suggestions.push(`Add required fields: ${error.missing.join(", ")}`);
      }
      if (error.type_mismatch) {
        for (const m of error.type_mismatch) {
          suggestions.push(
            `Change field "${m.field}" type from ${m.actual} to ${m.expected}`
          );
        }
      }
      if (error.extra && error.extra.length > 0) {
        suggestions.push(`Remove extra fields: ${error.extra.join(", ")}`);
      }
    } else {
      suggestions.push(
        `Mock test failed: ${error.mock_result?.error_message ?? "unknown error"}. ` +
        `Adjust schema fields to pass provider validation.`
      );
    }

    throw createContractVerificationError({
      schema_id: "retry-exhausted",
      provider_id: input.providerId,
      status:
        error.type === "manifest_mismatch"
          ? "manifest_mismatch"
          : "mock_failure",
      manifest_diff:
        error.type === "manifest_mismatch"
          ? {
              missing: error.missing ?? [],
              extra: error.extra ?? [],
              type_mismatch: error.type_mismatch ?? [],
            }
          : undefined,
      mock_result: error.mock_result,
      retries: attempt,
      suggestions,
    });
  }

  // Step 1: Build feedback prompt
  const feedbackPrompt = buildFeedbackPrompt(error);

  // Step 2: Re-negotiate with injected feedback
  const constraints = {
    ...(input.constraints ?? {}),
    _verification_feedback: feedbackPrompt,
  };

  const retryLLMOptions = input.llmOptions?.apiKey
    ? {
        llm: createOpenAICompatibleClient({
          apiKey: input.llmOptions.apiKey,
          model: input.llmOptions.model,
          baseUrl: input.llmOptions.baseUrl,
        }),
      }
    : { allowMockLLM: true };

  const negotiated = await negotiateSchema(
    { task: input.task, goal: input.goal, constraints },
    retryLLMOptions
  );

  // Step 3: Phase 1a — Re-run manifest matching
  const manifestConstraints = await loadManifestFromPack(input.packDir);
  if (manifestConstraints.length > 0) {
    const mergedConstraint = mergeConstraints(manifestConstraints);
    const manifestMatch = matchManifest(negotiated.schema, mergedConstraint);

    if (!manifestMatch.valid) {
      // Manifest still doesn't match — retry
      return retryWithFeedback(
        input,
        {
          type: "manifest_mismatch",
          missing: manifestMatch.missing,
          extra: manifestMatch.extra,
          type_mismatch: manifestMatch.type_mismatch,
        },
        attempt + 1
      );
    }
  }

  // Step 4: Phase 1b — Re-run mock test
  const mockTestResult = await runMockTestInRetry(
    negotiated.schema,
    input.packDir,
    input.providerId
  );

  if (!mockTestResult.passed) {
    // Mock test still fails — retry
    return retryWithFeedback(
      input,
      {
        type: "mock_failure",
        mock_result: mockTestResult.mockResult,
      },
      attempt + 1
    );
  }

  // Step 5: Success — generate SDK and return
  const outputDir = `/tmp/synapse-verify-${Date.now()}`;
  const sdkResult = await generateSdk({
    packDir: input.packDir,
    lang: input.lang ?? "typescript",
    outputDir,
  });

  return {
    schema: negotiated.schema,
    schema_id: negotiated.schema_id,
    sdk_code: sdkResult.files.map((f) => f.content).join("\n"),
    verification_result: {
      status: "passed",
      verified_at: new Date().toISOString(),
    },
  };
}
