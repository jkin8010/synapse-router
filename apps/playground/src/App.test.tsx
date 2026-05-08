// Smoke test for App component.
// Full DOM rendering tests require jsdom/happy-dom which is out of scope for this plan.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("App", () => {
  it("should export a default function component", async () => {
    const mod = await import("./App");
    assert.equal(typeof mod.default, "function");
  });
});
