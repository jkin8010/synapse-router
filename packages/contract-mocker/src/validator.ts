import type { Schema } from "@synapse-router/core";
import type { ValidationResult, ValidationError } from "./types.js";

export function validateRequestBody(schema: Schema, body: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const fields = schema.fields ?? [];

  // Treat non-object body as empty object
  const data: Record<string, unknown> =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  // Check required fields
  for (const field of fields) {
    if (field.required && !(field.name in data)) {
      errors.push({
        field: field.name,
        code: "missing_required",
        expected: field.type,
      });
    }
  }

  // Check field types and unknown fields
  const fieldNames = new Set(fields.map((f) => f.name));
  const fieldMap = new Map(fields.map((f) => [f.name, f]));

  for (const [key, value] of Object.entries(data)) {
    if (!fieldNames.has(key)) {
      errors.push({
        field: key,
        code: "unknown_field",
      });
      continue;
    }

    const field = fieldMap.get(key)!;
    if (!checkFieldType(value, field.type, field.enumValues)) {
      errors.push({
        field: key,
        code: "type_mismatch",
        expected: field.type,
        actual: typeof value,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function checkFieldType(
  value: unknown,
  expectedType: string,
  enumValues?: string[]
): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  switch (expectedType) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && !Number.isNaN(value);
    case "boolean":
      return typeof value === "boolean";
    case "enum":
      return typeof value === "string" && (enumValues ?? []).includes(value as string);
    case "image":
      return typeof value === "string";
    default:
      return false;
  }
}
