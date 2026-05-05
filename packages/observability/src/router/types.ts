export interface NegotiateSpanAttrs {
  agent_schema?: Record<string, unknown>;
  target_provider?: string;
  accepted_count?: number;
  rejected_count?: number;
  best_match_provider?: string;
  best_match_intent?: string;
}

export interface LockSpanAttrs {
  cache_hit?: boolean;
  lock_id?: string;
  intent?: string;
  provider?: string;
  pack_version?: string;
}

export interface ConnectSpanAttrs {
  provider: string;
  feature_id: string;
  base_url?: string;
  auth_type?: string;
  http_status?: number;
  latency_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
  error_type?: string;
}

export interface BillingSpanAttrs {
  provider: string;
  feature_id: string;
  estimated_cost?: number;
  actual_cost?: number;
  quota_id?: string;
  quota_exceeded?: boolean;
}
