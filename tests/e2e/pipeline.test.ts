import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { negotiateAndVerify } from "../../packages/negotiator/src/verifier.js";
import { join } from "node:path";
import { ROOT, PACKS_DIR } from "./helpers.js";
import { NEGOTIATE_AND_VERIFY_INPUT } from "./fixtures.js";

describe("negotiateAndVerify pipeline E2E", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  before(() => { delete process.env.OPENAI_API_KEY; });
  after(() => { if (originalApiKey !== undefined) process.env.OPENAI_API_KEY = originalApiKey; });

  it("completes full pipeline with mock LLM and MockServer", async () => {
    const result = await negotiateAndVerify({ ...NEGOTIATE_AND_VERIFY_INPUT, packDir: join(PACKS_DIR, "openai") });
    assert.ok(result.schema, "should have schema");
    assert.ok(result.schema.name, "schema should have a name");
    assert.ok(Array.isArray((result.schema as any).fields), "schema should have fields array");
    assert.ok(typeof result.schema_id === "string" && result.schema_id.length > 0, "schema_id should be non-empty string");
    assert.ok(typeof result.sdk_code === "string", "sdk_code should be a string");
    assert.ok(result.verification_result, "should have verification_result");
    assert.ok(result.verification_result.status === "passed" || result.verification_result.status === "failed");
    assert.ok(result.verification_result.verified_at, "should have verified_at timestamp");
  }, { timeout: 30000 });
});
