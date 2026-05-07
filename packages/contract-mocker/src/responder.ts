import type { Schema, Field } from "@synapse-router/core";

export function generateFakeResponse(schema: Schema): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of schema.fields) {
    result[field.name] = generateFakeValue(field);
  }
  return result;
}

function generateFakeValue(field: Field): unknown {
  switch (field.type) {
    case "string":
      return `mock_${field.name}_${Date.now()}`;
    case "number":
      return Math.floor(Math.random() * 1000);
    case "boolean":
      return Math.random() > 0.5;
    case "enum":
      if (field.enumValues && field.enumValues.length > 0) {
        return field.enumValues[Math.floor(Math.random() * field.enumValues.length)];
      }
      return `mock_${field.name}_value`;
    case "image": {
      // Minimal 1x1 white PNG data URL
      const pngBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      return `data:image/png;base64,${pngBase64}`;
    }
    default:
      return null;
  }
}
