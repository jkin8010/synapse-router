import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { getProviderSpecsForTask, getProvidersForTask, route } from "./index.js";

describe("route", () => {
  test("filters providers by task", () => {
    assert.deepEqual(getProvidersForTask("summarize this document").map((provider) => provider.name), ["openai"]);
    assert.deepEqual(getProvidersForTask("generate image").map((provider) => provider.name), ["comfyui"]);
  });

  test("reads provider specs for routing decisions", () => {
    assert.deepEqual(getProviderSpecsForTask("summarize this document").map((spec) => spec.name), ["openai"]);
    assert.deepEqual(getProviderSpecsForTask("generate image").map((spec) => spec.name), ["comfyui"]);
  });

  test("uses strategy preference when the provider supports the task", () => {
    assert.equal(route("summarize this document", "fast"), "openai");
    assert.equal(route("generate image", "quality"), "comfyui");
  });

  test("falls back to a supported provider when the strategy preference is not available", () => {
    assert.equal(route("generate image", "fast"), "comfyui");
    assert.equal(route("summarize this document", "quality"), "openai");
  });
});
