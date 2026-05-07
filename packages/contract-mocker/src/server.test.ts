import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { MockServer } from "./server.js";
import type { Schema } from "@synapse-router/core";

const testSchema: Schema = {
  name: "test",
  fields: [
    { name: "name", type: "string", required: true },
    { name: "age", type: "number", required: true },
    { name: "active", type: "boolean" },
  ],
};

describe("MockServer", () => {
  afterEach(async () => {
    // Cleanup any leftover servers
  });

  it("start() returns a non-zero port", async () => {
    const server = new MockServer({
      schema: testSchema,
      endpoint: "/test",
      method: "POST",
    });
    const port = await server.start(0);
    assert.ok(port > 0, `Expected port > 0, got ${port}`);
    assert.equal(server.getPort(), port);
    assert.ok(server.isRunning());
    await server.stop();
  });

  it("returns 200 with fake data for a matching request", async () => {
    const server = new MockServer({
      schema: testSchema,
      endpoint: "/test",
      method: "POST",
    });
    const port = await server.start(0);
    const res = await fetch(`http://localhost:${port}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice", age: 30, active: true }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as Record<string, unknown>;
    assert.ok(typeof body.name === "string");
    assert.ok(typeof body.age === "number");
    assert.ok(typeof body.active === "boolean");
    await server.stop();
  });

  it("returns 404 for unknown endpoint", async () => {
    const server = new MockServer({
      schema: testSchema,
      endpoint: "/test",
      method: "POST",
    });
    const port = await server.start(0);
    const res = await fetch(`http://localhost:${port}/unknown`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice", age: 30 }),
    });
    assert.equal(res.status, 404);
    await server.stop();
  });

  it("returns 405 for wrong method", async () => {
    const server = new MockServer({
      schema: testSchema,
      endpoint: "/test",
      method: "POST",
    });
    const port = await server.start(0);
    const res = await fetch(`http://localhost:${port}/test`, {
      method: "GET",
    });
    assert.equal(res.status, 405);
    await server.stop();
  });

  it("stop() closes the server and marks it as not running", async () => {
    const server = new MockServer({
      schema: testSchema,
      endpoint: "/test",
      method: "POST",
    });
    await server.start(0);
    assert.ok(server.isRunning());
    await server.stop();
    assert.equal(server.isRunning(), false);
  });

  it("returns 422 for request body validation failure", async () => {
    const server = new MockServer({
      schema: testSchema,
      endpoint: "/test",
      method: "POST",
    });
    const port = await server.start(0);
    const res = await fetch(`http://localhost:${port}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice" }), // missing required "age"
    });
    assert.equal(res.status, 422);
    const body = await res.json() as Record<string, unknown>;
    assert.ok(body.validation_errors);
    await server.stop();
  });
});
