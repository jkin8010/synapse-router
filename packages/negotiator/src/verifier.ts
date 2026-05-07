// ─── D-08~D-11: negotiateAndVerify Pipeline Orchestration ───────────────

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
  MockResult,
  VerificationResult,
} from "./types.js";
import type { Schema } from "@synapse-router/core";
import { MockServer } from "@synapse-router/contract-mocker";
import { generateSdk } from "@synapse-router/sdk-generator";

// ─── Public Types ─────────────────────────────────────────────────────────

export interface NegotiateAndVerifyInput {
  task: string;
  goal: string;
  constraints?: Record<string, unknown>;
  providerId: string;
  packDir: string;
  lang?: "typescript" | "python";
  llmOptions?: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
}

export interface NegotiationResult {
  schema: Schema;
  schema_id: string;
  sdk_code: string;
  verification_result: VerificationResult;
}

// ─── LLM Client helper ───────────────────────────────────────────────────

function createLLMClientFromOptions(llmOptions: {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}) {
  const apiKey =
    llmOptions.apiKey ?? process.env.OPENAI_API_KEY ?? "sk-placeholder";
  return createOpenAICompatibleClient({
    apiKey,
    model: llmOptions.model,
    baseUrl: llmOptions.baseUrl,
  });
}

// ─── mergeConstraints ─────────────────────────────────────────────────────

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

// ─── runMockTest ──────────────────────────────────────────────────────────

export async function runMockTest(
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

// ─── negotiateAndVerify ───────────────────────────────────────────────────

export async function negotiateAndVerify(
  input: NegotiateAndVerifyInput
): Promise<NegotiationResult> {
  const llm = input.llmOptions
    ? { llm: createLLMClientFromOptions(input.llmOptions) }
    : {};

  // Step 1: negotiateSchema — 协商 Schema
  const negotiated = await negotiateSchema(
    { task: input.task, goal: input.goal, constraints: input.constraints },
    llm
  );

  // Step 2: Phase 1a — 加载 Manifest 并匹配
  const constraints = await loadManifestFromPack(input.packDir);
  if (constraints.length > 0) {
    const mergedConstraint = mergeConstraints(constraints);
    const manifestMatch = matchManifest(negotiated.schema, mergedConstraint);

    if (!manifestMatch.valid) {
      // Delegate to retry; retry.ts will re-negotiate with feedback
      const retry = await import("./retry.js");
      return retry.retryWithFeedback(
        input,
        {
          type: "manifest_mismatch",
          missing: manifestMatch.missing,
          extra: manifestMatch.extra,
          type_mismatch: manifestMatch.type_mismatch,
        },
        0
      );
    }
  }

  // Step 3: Phase 1b — 生成 SDK + Mock 测试
  const outputDir = `/tmp/synapse-verify-${Date.now()}`;
  const sdkResult = await generateSdk({
    packDir: input.packDir,
    lang: input.lang ?? "typescript",
    outputDir,
  });

  const mockTestResult = await runMockTest(
    negotiated.schema,
    input.packDir,
    input.providerId
  );

  if (!mockTestResult.passed) {
    // Delegate to retry
    const retry = await import("./retry.js");
    return retry.retryWithFeedback(
      input,
      {
        type: "mock_failure",
        mock_result: mockTestResult.mockResult,
      },
      0
    );
  }

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
