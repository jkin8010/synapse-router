import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Schema } from "@synapse-router/core";
import type {
  ManifestConstraint,
  ManifestFieldMismatch,
  ManifestMatchResult,
} from "./types.js";

// ─── Types for DSL document structure ────────────────────────────────────

interface DslFeature {
  feature_id: string;
  constraints?: ManifestConstraint;
}

interface DslDocument {
  features?: DslFeature[];
}

// ─── loadManifestFromPack ────────────────────────────────────────────────

/**
 * 从 pack 的 DSL 目录加载所有 manifest 约束。
 * 读取 packDir/dsl/*.json，提取每个 feature 的 constraints 字段并合并。
 * 如果 DSL 目录不存在或无法读取，返回空数组。
 */
export async function loadManifestFromPack(
  packDir: string
): Promise<ManifestConstraint[]> {
  const dslDir = join(packDir, "dsl");
  const constraints: ManifestConstraint[] = [];

  try {
    const entries = await readdir(dslDir);

    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;

      try {
        const content = await readFile(join(dslDir, entry), "utf8");
        const doc = JSON.parse(content) as DslDocument;

        if (doc.features && Array.isArray(doc.features)) {
          for (const feature of doc.features) {
            if (feature.constraints) {
              constraints.push(feature.constraints);
            }
          }
        }
      } catch {
        // Skip malformed or unreadable DSL files
      }
    }
  } catch {
    // DSL directory doesn't exist — return empty array
  }

  return constraints;
}

// ─── matchManifest ───────────────────────────────────────────────────────

/**
 * 将 Agent schema 与单个 Provider manifest 约束进行匹配。
 * 检测三种差异：字段缺失、字段超量、类型不匹配。
 *
 * valid 为 true 当且仅当没有 missing 字段且没有 type_mismatch。
 * extra 字段（Agent 提供了 manifest 未声明的字段）不影响 validity，
 * 但会在结果中报告。
 */
export function matchManifest(
  schema: Schema,
  constraints: ManifestConstraint
): ManifestMatchResult {
  const result: ManifestMatchResult = {
    valid: true,
    missing: [],
    extra: [],
    type_mismatch: [],
  };

  const schemaFieldMap = new Map(schema.fields.map((f) => [f.name, f]));

  // 1. Check required fields are present and marked required in schema
  for (const requiredName of constraints.required ?? []) {
    const field = schemaFieldMap.get(requiredName);
    if (!field || !field.required) {
      result.missing.push(requiredName);
    }
  }

  // 2. Check field types match constraints
  for (const [fieldName, expectedType] of Object.entries(
    constraints.type ?? {}
  )) {
    const field = schemaFieldMap.get(fieldName);
    if (field && field.type !== expectedType) {
      result.type_mismatch.push({
        field: fieldName,
        expected: expectedType,
        actual: field.type,
      });
    }
  }

  // 3. Check for extra fields in schema not declared in manifest
  const manifestFieldNames = new Set([
    ...(constraints.required ?? []),
    ...Object.keys(constraints.type ?? {}),
    ...Object.keys(constraints.enum ?? {}),
    ...Object.keys(constraints.minLength ?? {}),
    ...Object.keys(constraints.maxLength ?? {}),
  ]);

  for (const field of schema.fields) {
    if (!manifestFieldNames.has(field.name)) {
      result.extra.push(field.name);
    }
  }

  // valid = no missing required fields AND no type mismatches
  result.valid =
    result.missing.length === 0 && result.type_mismatch.length === 0;

  return result;
}

// ─── buildSuggestions ────────────────────────────────────────────────────

/**
 * 根据 ManifestMatchResult 生成人类可读的修复建议。
 * 每条建议面向 LLM 可消费的英文提示。
 */
export function buildSuggestions(result: ManifestMatchResult): string[] {
  const suggestions: string[] = [];

  if (result.missing.length > 0) {
    suggestions.push(
      `Add required fields: ${result.missing.join(", ")}`
    );
  }

  for (const mismatch of result.type_mismatch) {
    suggestions.push(
      `Change field "${mismatch.field}" type from ${mismatch.actual} to ${mismatch.expected}`
    );
  }

  if (result.extra.length > 0) {
    suggestions.push(
      `Remove extra fields: ${result.extra.join(", ")}`
    );
  }

  return suggestions;
}
