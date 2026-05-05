// Core types

export type SpanName = 'negotiate' | 'lock' | 'connect' | 'billing' | 'custom';
export type SpanStatus = 'ok' | 'error' | 'timeout';
export type TraceSource = 'cli' | 'api' | 'sdk' | 'custom';
export type SamplingMode = 'all' | 'errors-first' | 'percent' | 'none';
export type OutputType = 'jsonl' | 'console' | 'http' | 'memory';

export interface TraceError {
  type: "HTTP_ERROR" | "AUTH_ERROR" | "RATE_LIMIT" | "TIMEOUT"
      | "MAPPING_ERROR" | "SCHEMA_ERROR" | "QUOTA_EXCEEDED" | "UNKNOWN";
  message: string;
  status?: number;
  hint: string;
  fix_suggestion: string[];
  context: Record<string, unknown>;
  stack?: string;
}

export interface SpanEvent {
  name: string;
  timestamp: string;
  attributes: Record<string, unknown>;
}

export interface Span {
  id: string;
  name: string;
  trace_id: string;
  started_at: string;
  ended_at?: string;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
  status: SpanStatus;
  error?: TraceError;
  duration_ms: number;
}

export interface Trace {
  id: string;
  name: string;
  source: TraceSource;
  started_at: string;
  ended_at?: string;
  spans: Span[];
  metadata: Record<string, unknown>;
  tags: Record<string, string>;
  duration_ms: number;
}

export interface TraceEvent {
  trace_id: string;
  span_name?: string;
  type: string;
  timestamp: string;
  attributes: Record<string, unknown>;
}

// Configuration types
export interface OutputConfig {
  type: OutputType;
  path?: string;           // jsonl output path
  level?: string;          // console log level
  url?: string;            // http endpoint
  maxEntries?: number;     // memory max entries
}

export interface SamplingConfig {
  mode: SamplingMode;
  percent?: number;        // for 'percent' mode
}

export interface RedactConfig {
  apiKeys?: boolean;
  inputPreview?: boolean;
  outputPreview?: boolean;
  inputPreviewLength?: number;   // default 100
  outputPreviewLength?: number;  // default 200
}

export interface TracerConfig {
  outputs: OutputConfig[];
  sampling?: SamplingConfig;
  redact?: RedactConfig;
  maxTraces?: number;      // default 1000
  retentionDays?: number;  // default 7
  enabled?: boolean;       // default true
}
