/**
 * 字段映射逻辑：canonical ↔ provider
 *
 * mapInput: canonical → provider（发送请求前）
 * mapOutput: provider → canonical（接收响应后，反向映射）
 */

import type { ConnectLock } from "./types.js";

type FieldMapping = ConnectLock["field_mappings"][number];

// ─── Transform Functions ────────────────────────────────────────────────────

function applyTransform(value: unknown, transform: string | undefined): unknown {
  if (value === undefined || value === null) return value;

  switch (transform) {
    case "passthrough":
    case undefined:
      return value;

    case "extract_url":
      // 从对象中提取 URL（如 { url: "https://..." } → "https://..."）
      if (typeof value === "object" && value !== null && "url" in value) {
        return (value as Record<string, unknown>).url;
      }
      if (Array.isArray(value)) {
        return value.map((item) => {
          if (typeof item === "object" && item !== null && "url" in item) {
            return (item as Record<string, unknown>).url;
          }
          return item;
        });
      }
      return value;

    case "base64_decode":
      if (typeof value === "string") {
        try {
          return Buffer.from(value, "base64").toString("utf-8");
        } catch {
          return value;
        }
      }
      return value;

    case "json_parse":
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;

    case "cast_number":
      if (typeof value === "string" || typeof value === "boolean") {
        const num = Number(value);
        return Number.isNaN(num) ? value : num;
      }
      return value;

    default:
      return value;
  }
}

// ─── Input Mapping: canonical → provider ────────────────────────────────────

/**
 * 将 canonical 字段的输入映射为 provider 字段的输入
 * 
 * 策略: 映射 + 透传
 * 1. 将 canonical 字段映射为 provider 字段（如 prompt → messages）
 * 2. 合并用户直接提供的 provider 字段（如 messages, model 等）
 * 
 * 如果用户同时提供了 canonical 和 provider 字段，provider 字段优先（更具体）
 */
export function mapInput(
  canonicalInput: Record<string, unknown>,
  fieldMappings: FieldMapping[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Step 1: 映射 canonical → provider
  for (const mapping of fieldMappings) {
    const { canonical_field, provider_field, required, fallback, transform } = mapping;

    let value = canonicalInput[canonical_field];

    // 如果没有提供值，尝试使用 fallback
    if (value === undefined) {
      if (fallback !== undefined) {
        value = fallback;
      } else if (required) {
        continue;
      } else {
        continue;
      }
    }

    // 应用 transform
    const transformed = applyTransform(value, transform);
    result[provider_field] = transformed;
  }

  // Step 2: 透传用户直接提供的字段（包括 provider 字段名和不在 mapping 中的字段）
  // 收集所有 provider_field 名称，用于判断哪些用户输入是 provider 格式
  const providerFields = new Set(fieldMappings.map((m) => m.provider_field));
  const canonicalFields = new Set(fieldMappings.map((m) => m.canonical_field));

  for (const [key, value] of Object.entries(canonicalInput)) {
    if (value === undefined) continue;

    // 如果是 provider 字段名，且 canonical_field !== provider_field，直接透传（覆盖映射结果）
    // 当 canonical_field === provider_field 时，Step 1 已处理，不覆盖
    if (providerFields.has(key)) {
      const mapping = fieldMappings.find((m) => m.provider_field === key);
      if (mapping && mapping.canonical_field !== key) {
        result[key] = value;
      }
    }
    // 如果既不是 canonical 字段也不是 provider 字段，也透传（如 model, stream 等额外参数）
    else if (!canonicalFields.has(key)) {
      result[key] = value;
    }
  }

  return result;
}

// ─── Output Mapping: provider → canonical ───────────────────────────────────

/**
 * 将 provider 字段的输出映射回 canonical 字段
 * 例如: { choices: [...] } → { response: [...] }
 *
 * 注意：反向映射使用反向查找——从 provider_field 找到对应的 canonical_field
 */
export function mapOutput(
  providerOutput: Record<string, unknown>,
  fieldMappings: FieldMapping[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const mapping of fieldMappings) {
    const { canonical_field, provider_field, transform } = mapping;

    const value = providerOutput[provider_field];
    if (value === undefined) continue;

    // 反向映射时对输出应用 transform
    const transformed = applyTransform(value, transform);
    result[canonical_field] = transformed;
  }

  // 保留 provider 响应中未在 field_mappings 中定义的字段
  // （如 id, object, created 等 metadata）
  for (const [key, value] of Object.entries(providerOutput)) {
    const isMapped = fieldMappings.some((m) => m.provider_field === key);
    if (!isMapped && value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}
