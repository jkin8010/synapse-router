// ─── Manifest Constraint Types (D-05) ────────────────────────────────────

/**
 * Provider Manifest 约束：从 DSL features[].constraints 提取的字段级约束。
 * JSON Schema 子集：required、type、enum、minLength、maxLength。
 */
export interface ManifestConstraint {
  /** 必须存在的字段名列表 */
  required?: string[];
  /** 字段名 -> 期望的类型名（如 "string"、"number"、"boolean"） */
  type?: Record<string, string>;
  /** 字段名 -> 允许的枚举值列表 */
  enum?: Record<string, string[]>;
  /** 字段名 -> 最小长度 */
  minLength?: Record<string, number>;
  /** 字段名 -> 最大长度 */
  maxLength?: Record<string, number>;
}

// ─── Manifest Match Result ───────────────────────────────────────────────

/** 单个字段的类型不匹配详情 */
export interface ManifestFieldMismatch {
  field: string;
  expected: string;
  actual: string;
}

/**
 * Manifest 匹配结果。
 * 检测字段缺失、字段超量、类型不匹配三种差异。
 */
export interface ManifestMatchResult {
  /** 是否通过匹配（无 missing + 无 type_mismatch） */
  valid: boolean;
  /** Agent schema 中缺失的 required 字段 */
  missing: string[];
  /** Agent schema 中存在但 manifest 未声明的额外字段 */
  extra: string[];
  /** 字段类型不匹配列表 */
  type_mismatch: ManifestFieldMismatch[];
}

// ─── Verification Types ──────────────────────────────────────────────────

/** 验证状态 */
export type VerificationStatus = "manifest_mismatch" | "mock_failure" | "timeout" | "passed";

/** Manifest 差异详情（用于 VerificationResult 和 ContractVerificationError 共享） */
export interface ManifestDiff {
  missing: string[];
  extra: string[];
  type_mismatch: ManifestFieldMismatch[];
}

/** Mock 测试结果 */
export interface MockResult {
  request_sent: unknown;
  response_received: unknown;
  error_message: string;
}

/** 单次验证结果 */
export interface VerificationResult {
  status: VerificationStatus;
  manifest_diff?: ManifestDiff;
  mock_result?: MockResult;
  verified_at: string;
}
