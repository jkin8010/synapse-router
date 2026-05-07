import type { Schema } from "@synapse-router/core";

export interface MockServerConfig {
  schema: Schema;
  endpoint: string;
  method: "POST" | "GET";
  responseDelay?: number;
}

export interface MockResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface ValidationError {
  field: string;
  code: "missing_required" | "type_mismatch" | "unknown_field";
  expected?: string;
  actual?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
