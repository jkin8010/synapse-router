/**
 * 共享类型定义
 */

/**
 * Connector 使用的 Lock 结构
 */
export interface ConnectLock {
  intent: string;
  provider: string;
  feature_id: string;
  input_schema: {
    fields: Array<{ name: string; type: string; required: boolean }>;
  };
  output_schema: {
    fields: Array<{ name: string; type: string }>;
  };
  field_mappings: Array<{
    canonical_field: string;
    provider_field: string;
    required?: boolean;
    transform?: "passthrough" | "extract_url" | "base64_decode" | "json_parse" | "cast_number";
    fallback?: unknown;
  }>;
}

export interface ConnectParams {
  /** Schema Lock 信息（来自 negotiate 的结果或缓存） */
  lock: ConnectLock;
  /** 用户输入（canonical 字段） */
  input: Record<string, unknown>;
  /** Provider 连接信息 */
  connection: {
    base_url: string;
    api_key: string;
    auth_type: "Bearer" | "APIKey" | "OAuth2";
    /** Optional: explicit API endpoint path, e.g. "/api/v1/services/...".
     *  When provided, takes priority over path derived from lock.feature_id. */
    endpoint?: string;
  };
  /**
   * Opt-in: include the provider's raw response in `ConnectResult.raw`.
   * Intended for diagnostics only (CLI --raw, smoke tests); canonical
   * consumers should rely on `output`.
   */
  includeRaw?: boolean;
}

export interface ConnectResult {
  /** 标准化输出（canonical 字段） */
  output: Record<string, unknown>;
  /**
   * Provider 原始响应 — 仅诊断用途。
   *
   * 只有在 `ConnectParams.includeRaw` 为 true（CLI `--raw` / smoke 诊断）时才
   * 返回，避免上层绕过 mapper 直接依赖 provider 私有字段。
   */
  raw?: unknown;
  meta: {
    provider: string;
    feature_id: string;
    model?: string;
    usage?: { input_tokens: number; output_tokens: number };
    latency_ms: number;
  };
}
