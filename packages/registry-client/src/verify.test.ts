import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { submitVerification, fetchPackManifest } from "./verify.js";
import type { VerificationSubmission } from "./verify.js";

// ─── submitVerification ───────────────────────────────────────────────────

describe("submitVerification", () => {
  it("should return silently when client is null (D-14)", async () => {
    const result: VerificationSubmission = {
      schema_id: "test-schema-1",
      provider_id: "test-provider",
      status: "passed",
      verified_at: new Date().toISOString(),
    };

    // Should not throw
    await assert.doesNotReject(async () => {
      await submitVerification(null, result);
    });
  });

  it("should not throw when client is null with full error result", async () => {
    const result: VerificationSubmission = {
      schema_id: "test-schema-2",
      provider_id: "test-provider",
      status: "manifest_mismatch",
      manifest_diff: {
        missing: ["required_field"],
        extra: [],
        type_mismatch: [{ field: "count", expected: "number", actual: "string" }],
      },
      verified_at: new Date().toISOString(),
    };

    // Should not throw
    await assert.doesNotReject(async () => {
      await submitVerification(null, result);
    });
  });
});

// ─── fetchPackManifest ────────────────────────────────────────────────────

describe("fetchPackManifest", () => {
  it("should return null when client is null", async () => {
    const result = await fetchPackManifest(null, "test-ns", "test-pack");
    assert.strictEqual(result, null);
  });

  it("should return null when client is null regardless of ns/name", async () => {
    const result = await fetchPackManifest(null, "any-ns", "any-name");
    assert.strictEqual(result, null);
  });
});
