import { randomUUID } from 'node:crypto';
import type {
  TracerConfig, Trace, Span, SpanEvent, TraceEvent,
  SpanName, SpanStatus, TraceSource, TraceError, OutputConfig
} from './types.js';

// Default config
const DEFAULT_CONFIG: TracerConfig = {
  outputs: [{ type: 'memory', maxEntries: 100 }],
  sampling: { mode: 'errors-first' },
  redact: { apiKeys: true, inputPreview: true, outputPreview: true },
  maxTraces: 1000,
  retentionDays: 7,
  enabled: true,
};

export class TraceEngine {
  private config: TracerConfig;
  private traces: Map<string, Trace> = new Map();
  private currentTrace: Trace | null = null;
  private eventQueue: TraceEvent[] = [];

  constructor(config: Partial<TracerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // Create a new Trace
  trace(name: string, source: TraceSource = 'custom'): TraceContext {
    if (!this.config.enabled) return new NoopTraceContext();

    const traceId = `tr_${randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();
    const trace: Trace = {
      id: traceId,
      name,
      source,
      started_at: now,
      spans: [],
      metadata: {},
      tags: {},
      duration_ms: 0,
    };
    this.traces.set(traceId, trace);
    this.currentTrace = trace;

    // Clean up old traces
    if (this.traces.size > (this.config.maxTraces ?? 1000)) {
      const oldest = this.traces.keys().next().value;
      if (oldest) this.traces.delete(oldest);
    }

    return new TraceContextImpl(trace, this);
  }

  // Query
  getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId);
  }

  listTraces(filter?: { provider?: string; since?: string; source?: TraceSource }): Trace[] {
    let result = [...this.traces.values()];
    if (filter?.since) {
      result = result.filter(t => t.started_at >= filter.since!);
    }
    if (filter?.source) {
      result = result.filter(t => t.source === filter.source);
    }
    return result;
  }

  exportTrace(traceId: string, format: 'json' = 'json'): string {
    const trace = this.traces.get(traceId);
    if (!trace) return '';
    return JSON.stringify(trace, null, 2);
  }

  // Internal methods
  _completeSpan(span: Span): void {
    span.ended_at = new Date().toISOString();
    span.duration_ms = new Date(span.ended_at).getTime() - new Date(span.started_at).getTime();
  }

  _emitEvent(event: TraceEvent): void {
    this.eventQueue.push(event);
    // Output to all configured outputs
    for (const output of this.config.outputs) {
      this._writeOutput(output, event);
    }
  }

  _addSpanToTrace(span: Span): void {
    if (this.currentTrace) {
      this.currentTrace.spans.push(span);
    }
  }

  _completeTrace(): void {
    if (this.currentTrace) {
      this.currentTrace.ended_at = new Date().toISOString();
      this.currentTrace.duration_ms =
        new Date(this.currentTrace.ended_at).getTime() - new Date(this.currentTrace.started_at).getTime();
      this.currentTrace = null;
    }
  }

  private _writeOutput(output: OutputConfig, event: TraceEvent): void {
    // Simple implementation: memory output is returned via getTrace
    // jsonl/console/http handled by subclass or external
    if (output.type === 'console') {
      const level = output.level || 'info';
      if (level === 'warn' && event.type !== 'error') return;
      console.log(this._formatConsole(event));
    }
  }

  private _formatConsole(event: TraceEvent): string {
    const ts = event.timestamp.slice(11, 19);
    const status = event.attributes.status || '●';
    return `[${ts}] ${event.trace_id} ${event.span_name || ''} ${status}`;
  }
}

// TraceContext interface
export interface TraceContext {
  id: string;
  span(name: SpanName | string): SpanBuilder;
  end(): void;
}

class TraceContextImpl implements TraceContext {
  constructor(
    private trace: Trace,
    private engine: TraceEngine
  ) {}

  get id(): string { return this.trace.id; }

  span(name: string): SpanBuilder {
    return new SpanBuilderImpl(name, this.trace, this.engine);
  }

  end(): void {
    this.engine._completeTrace();
  }
}

class NoopTraceContext implements TraceContext {
  get id(): string { return ''; }
  span(): SpanBuilder { return new NoopSpanBuilder(); }
  end(): void {}
}

// SpanBuilder interface
export interface SpanBuilder {
  start(attributes?: Record<string, unknown>): SpanBuilder;
  record(eventName: string, attributes?: Record<string, unknown>): SpanBuilder;
  end(attributes?: Record<string, unknown>): Span;
  recordError(error: Error, context?: Record<string, unknown>): SpanBuilder;
  status(status: SpanStatus): SpanBuilder;
}

class SpanBuilderImpl implements SpanBuilder {
  private span: Span;
  private started = false;

  constructor(
    name: string,
    trace: Trace,
    private engine: TraceEngine
  ) {
    this.span = {
      id: `sp_${randomUUID().slice(0, 8)}`,
      name,
      trace_id: trace.id,
      started_at: '',
      attributes: {},
      events: [],
      status: 'ok',
      duration_ms: 0,
    };
  }

  start(attributes?: Record<string, unknown>): SpanBuilder {
    this.started = true;
    this.span.started_at = new Date().toISOString();
    if (attributes) this.span.attributes = { ...this.span.attributes, ...attributes };
    return this;
  }

  record(eventName: string, attributes?: Record<string, unknown>): SpanBuilder {
    if (!this.started) this.start();
    const event: SpanEvent = {
      name: eventName,
      timestamp: new Date().toISOString(),
      attributes: attributes || {},
    };
    this.span.events.push(event);
    this.engine._emitEvent({
      trace_id: this.span.trace_id,
      span_name: this.span.name,
      type: eventName,
      timestamp: event.timestamp,
      attributes: event.attributes,
    });
    return this;
  }

  end(attributes?: Record<string, unknown>): Span {
    if (!this.started) this.start();
    if (attributes) this.span.attributes = { ...this.span.attributes, ...attributes };
    this.engine._completeSpan(this.span);
    this.engine._addSpanToTrace(this.span);
    this.engine._emitEvent({
      trace_id: this.span.trace_id,
      span_name: this.span.name,
      type: 'span_end',
      timestamp: this.span.ended_at!,
      attributes: { status: this.span.status, duration_ms: this.span.duration_ms },
    });
    return this.span;
  }

  recordError(error: Error, context?: Record<string, unknown>): SpanBuilder {
    if (!this.started) this.start();
    this.span.status = 'error';
    this.span.error = {
      type: 'UNKNOWN',
      message: error.message,
      hint: '检查 trace 详情获取更多上下文',
      fix_suggestion: ['查看错误堆栈', '检查相关配置'],
      context: context || {},
      stack: error.stack,
    };
    this.record('error', { message: error.message, ...context });
    return this;
  }

  status(status: SpanStatus): SpanBuilder {
    this.span.status = status;
    return this;
  }
}

class NoopSpanBuilder implements SpanBuilder {
  start(): SpanBuilder { return this; }
  record(): SpanBuilder { return this; }
  end(): Span {
    return {
      id: '', name: '', trace_id: '', started_at: '',
      attributes: {}, events: [], status: 'ok', duration_ms: 0,
    };
  }
  recordError(): SpanBuilder { return this; }
  status(): SpanBuilder { return this; }
}

// Export
export function createTracer(config?: Partial<TracerConfig>): TraceEngine {
  return new TraceEngine(config);
}
