// Core
export { TraceEngine, createTracer } from './tracer.js';
export type { TraceContext, SpanBuilder } from './tracer.js';

// Types
export type {
  Trace, Span, SpanEvent, TraceEvent, TraceError,
  TracerConfig, OutputConfig, SamplingConfig, RedactConfig,
  SpanName, SpanStatus, TraceSource, SamplingMode, OutputType,
} from './types.js';

// Error Diagnosis
export { diagnoseError } from './error-diagnosis.js';

// Sampler
export { Sampler } from './sampler.js';

// Redactor
export { Redactor } from './redactor.js';

// Outputs
export { JsonlOutput } from './outputs/jsonl.js';
