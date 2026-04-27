#!/usr/bin/env node
import { negotiateSchema } from "@synapse-router/negotiator";

// Verify negotiateSchema is importable and callable
console.log("negotiateSchema imported successfully:", typeof negotiateSchema === "function");

// Verify we can import from core
import { validateSchema } from "@synapse-router/core";
const result = validateSchema({ name: "test", fields: [{ name: "x", type: "string" }] });
console.log("validateSchema works:", result.valid);

console.log("\n✅ API app imports: PASSED!");
