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

// ─── loadManifestEnhanced (D-15: Registry-enhanced manifest loading) ─────

/**
 * Extract pack identity (namespace + name) from a local pack directory.
 *
 * Reads provider-card.json and extracts provider.id as the lookup key
 * for Registry queries. Returns null if the card cannot be read or parsed.
 */
async function extractPackIdentity(
  packDir: string,
): Promise<{ ns: string; name: string } | null> {
  try {
    const content = await readFile(join(packDir, "provider-card.json"), "utf8");
    const card = JSON.parse(content) as {
      provider?: { id?: string };
    };
    const id = card?.provider?.id;
    if (!id) return null;
    return { ns: id, name: id };
  } catch {
    return null;
  }
}

/**
 * Extract ManifestConstraint[] from a remote manifest (Registry spec object).
 *
 * The spec object is expected to have a top-level "features" array where
 * each feature may carry a "constraints" field. If the format is unrecognised,
 * returns an empty array.
 */
function extractConstraintsFromManifest(
  manifest: Record<string, unknown>,
): ManifestConstraint[] {
  const constraints: ManifestConstraint[] = [];

  try {
    const features = manifest["features"];
    if (!Array.isArray(features)) return constraints;

    for (const feature of features) {
      if (
        feature &&
        typeof feature === "object" &&
        "constraints" in feature
      ) {
        const c = (feature as Record<string, unknown>)["constraints"];
        if (c && typeof c === "object" && !Array.isArray(c)) {
          constraints.push(c as ManifestConstraint);
        }
      }
    }
  } catch {
    // Malformed manifest — return empty
  }

  return constraints;
}

/**
 * Merge local and remote constraints with local priority.
 *
 * Strategy:
 * 1. Start with all remote constraints
 * 2. For each local constraint, find the matching remote one (by feature_id
 *    if available, otherwise by required-fields overlap) and override.
 * 3. Local constraints without a remote match are appended as-is.
 *
 * This ensures local pack DSL takes precedence while remote fills gaps.
 */
function mergeConstraintsEnhanced(
  local: ManifestConstraint[],
  remote: ManifestConstraint[],
): ManifestConstraint[] {
  if (local.length === 0) return remote;
  if (remote.length === 0) return local;

  // Build a set of required field sets from local for fast overlap detection
  const localReqSets = local.map((c) => new Set(c.required ?? []));
  const remoteUsed = new Set<number>();
  const result: ManifestConstraint[] = [];

  for (let i = 0; i < local.length; i++) {
    const localReq = localReqSets[i]!;

    // Try to find a matching remote constraint by field overlap
    let bestMatch = -1;
    let bestOverlap = 0;

    for (let j = 0; j < remote.length; j++) {
      if (remoteUsed.has(j)) continue;
      const remoteReq = new Set(remote[j]!.required ?? []);
      const overlap = [...localReq].filter((f) => remoteReq.has(f)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = j;
      }
    }

    if (bestMatch >= 0) {
      // Merge: remote as base, local overrides
      remoteUsed.add(bestMatch);
      const merged: ManifestConstraint = { ...remote[bestMatch] };
      const localC = local[i]!;

      // Local required takes full precedence (not merged)
      merged.required = [...new Set([...(merged.required ?? []), ...(localC.required ?? [])])];
      if (localC.type) merged.type = { ...(merged.type ?? {}), ...localC.type };
      if (localC.enum) merged.enum = { ...(merged.enum ?? {}), ...localC.enum };
      if (localC.minLength) merged.minLength = { ...(merged.minLength ?? {}), ...localC.minLength };
      if (localC.maxLength) merged.maxLength = { ...(merged.maxLength ?? {}), ...localC.maxLength };

      result.push(merged);
    } else {
      // No remote match — use local as-is
      result.push(local[i]!);
    }
  }

  // Append remaining remote constraints that had no local match
  for (let j = 0; j < remote.length; j++) {
    if (!remoteUsed.has(j)) {
      result.push(remote[j]!);
    }
  }

  return result;
}

/**
 * Load manifest constraints from a pack directory with optional Registry
 * enhancement.
 *
 * 1. Always load local constraints from pack DSL files (offline-capable).
 * 2. If a RegistryClient is provided, attempt to fetch the remote manifest
 *    and merge with local (local takes priority).
 * 3. If the Registry is unavailable or the fetch fails, return local-only
 *    constraints (D-14: Registry is optional).
 *
 * @param packDir - Path to the local pack directory
 * @param registryClient - Optional Registry client for remote enhancement
 * @returns ManifestConstraint[] (never throws)
 */
export async function loadManifestEnhanced(
  packDir: string,
  registryClient?: import("@synapse-router/registry-client").RegistryClient | null,
): Promise<ManifestConstraint[]> {
  // Step 1: Always load local constraints
  const localConstraints = await loadManifestFromPack(packDir);

  // Step 2: Attempt remote enhancement if Registry is available
  if (!registryClient) return localConstraints;

  const identity = await extractPackIdentity(packDir);
  if (!identity) return localConstraints;

  try {
    const { fetchPackManifest } = await import(
      "@synapse-router/registry-client"
    );
    const remoteManifest = await fetchPackManifest(
      registryClient,
      identity.ns,
      identity.name,
    );

    if (!remoteManifest) return localConstraints;

    const remoteConstraints = extractConstraintsFromManifest(remoteManifest);
    if (remoteConstraints.length === 0) return localConstraints;

    // Step 3: Merge with local priority
    return mergeConstraintsEnhanced(localConstraints, remoteConstraints);
  } catch {
    // Registry unavailable — return local-only (D-14)
    return localConstraints;
  }
}
