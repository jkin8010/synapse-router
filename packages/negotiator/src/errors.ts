// ─── D-13: ContractVerificationError ──────────────────────────────────────

/**
 * 契约验证失败时的结构化错误。
 * 包含 manifest_diff、mock_result、retries 和人类可读的修复建议。
 * LLM 可消费此结构进行自动修复重试。
 */
export interface ContractVerificationError {
  schema_id: string;
  provider_id: string;
  status: "manifest_mismatch" | "mock_failure" | "timeout";
  manifest_diff?: {
    missing: string[];
    extra: string[];
    type_mismatch: Array<{ field: string; expected: string; actual: string }>;
  };
  mock_result?: {
    request_sent: unknown;
    response_received: unknown;
    error_message: string;
  };
  retries: number;
  suggestions: string[];
}

/**
 * 工厂函数：创建 ContractVerificationError 对象。
 */
export function createContractVerificationError(params: {
  schema_id: string;
  provider_id: string;
  status: ContractVerificationError["status"];
  manifest_diff?: ContractVerificationError["manifest_diff"];
  mock_result?: ContractVerificationError["mock_result"];
  retries: number;
  suggestions: string[];
}): ContractVerificationError {
  return { ...params };
}
