import { describe, it, expect, beforeEach } from 'vitest';
import { createTracer, TraceEngine } from './tracer.js';
import type { Trace } from './types.js';

describe('TraceEngine', () => {
  let tracer: TraceEngine;

  beforeEach(() => {
    tracer = createTracer();
  });

  describe('createTracer', () => {
    it('should create a TraceEngine instance', () => {
      expect(tracer).toBeInstanceOf(TraceEngine);
    });

    it('should accept partial config', () => {
      const custom = createTracer({ maxTraces: 500 });
      expect(custom).toBeInstanceOf(TraceEngine);
    });
  });

  describe('trace', () => {
    it('should create a new trace with a unique id', () => {
      const trace1 = tracer.trace('test-trace');
      const trace2 = tracer.trace('test-trace-2');
      expect(trace1.id).toBeTruthy();
      expect(trace2.id).toBeTruthy();
      expect(trace1.id).not.toBe(trace2.id);
      expect(trace1.id).toMatch(/^tr_/);
    });

    it('should create a trace that can be retrieved', () => {
      const ctx = tracer.trace('retrievable-trace', 'cli');
      const trace = tracer.getTrace(ctx.id);
      expect(trace).toBeDefined();
      expect(trace!.name).toBe('retrievable-trace');
      expect(trace!.source).toBe('cli');
    });

    it('should return NoopTraceContext when disabled', () => {
      const disabled = createTracer({ enabled: false });
      const ctx = disabled.trace('disabled-trace');
      expect(ctx.id).toBe('');
      expect(disabled.getTrace(ctx.id)).toBeUndefined();
    });

    it('should clean up old traces when maxTraces is exceeded', () => {
      const small = createTracer({ maxTraces: 3 });
      const t1 = small.trace('t1');
      const t2 = small.trace('t2');
      const t3 = small.trace('t3');
      const t4 = small.trace('t4');
      expect(small.getTrace(t1.id)).toBeUndefined();
      expect(small.getTrace(t4.id)).toBeDefined();
    });
  });

  describe('span start/record/end', () => {
    it('should create a span and add it to the trace', () => {
      const ctx = tracer.trace('span-test');
      const span = ctx.span('negotiate').start({ key: 'value' }).end();
      expect(span.id).toMatch(/^sp_/);
      expect(span.name).toBe('negotiate');
      expect(span.status).toBe('ok');
      expect(span.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should record events within a span', () => {
      const ctx = tracer.trace('event-test');
      const span = ctx.span('connect')
        .start()
        .record('http_request', { url: 'https://example.com' })
        .record('http_response', { status: 200 })
        .end();
      expect(span.events).toHaveLength(2);
      expect(span.events[0].name).toBe('http_request');
      expect(span.events[1].name).toBe('http_response');
    });

    it('should record errors on a span', () => {
      const ctx = tracer.trace('error-test');
      const err = new Error('Something went wrong');
      const span = ctx.span('connect')
        .start()
        .recordError(err, { detail: 'test context' })
        .end();
      expect(span.status).toBe('error');
      expect(span.error).toBeDefined();
      expect(span.error!.message).toBe('Something went wrong');
      expect(span.error!.fix_suggestion.length).toBeGreaterThan(0);
    });

    it('should set span status', () => {
      const ctx = tracer.trace('status-test');
      const span = ctx.span('billing')
        .start()
        .status('timeout')
        .end();
      expect(span.status).toBe('timeout');
    });

    it('should support chaining', () => {
      const ctx = tracer.trace('chain-test');
      const span = ctx.span('lock')
        .start({ cache_hit: false })
        .record('cache_miss', { key: 'abc' })
        .status('ok')
        .end();
      expect(span.name).toBe('lock');
      expect(span.events).toHaveLength(1);
    });
  });

  describe('getTrace', () => {
    it('should return undefined for non-existent trace', () => {
      expect(tracer.getTrace('tr_nonexistent')).toBeUndefined();
    });

    it('should return a trace with its spans', () => {
      const ctx = tracer.trace('get-trace');
      ctx.span('negotiate').start().end();
      const trace = tracer.getTrace(ctx.id);
      expect(trace).toBeDefined();
      expect(trace!.spans).toHaveLength(1);
    });
  });

  describe('listTraces', () => {
    it('should return all traces when no filter', () => {
      tracer.trace('trace1');
      tracer.trace('trace2');
      const all = tracer.listTraces();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by source', () => {
      tracer.trace('cli-trace', 'cli');
      tracer.trace('api-trace', 'api');
      const cliTraces = tracer.listTraces({ source: 'cli' });
      expect(cliTraces.every(t => t.source === 'cli')).toBe(true);
    });

    it('should filter by since', () => {
      const now = new Date().toISOString();
      tracer.trace('old-trace');
      const newCtx = tracer.trace('new-trace');
      const since = new Date(Date.now() - 1).toISOString();
      const filtered = tracer.listTraces({ since });
      expect(filtered.some(t => t.id === newCtx.id)).toBe(true);
    });
  });

  describe('exportTrace', () => {
    it('should export a trace as JSON', () => {
      const ctx = tracer.trace('export-test');
      ctx.span('negotiate').start().end();
      const json = tracer.exportTrace(ctx.id);
      expect(json).toBeTruthy();
      const parsed = JSON.parse(json);
      expect(parsed.id).toBe(ctx.id);
      expect(parsed.name).toBe('export-test');
    });

    it('should return empty string for non-existent trace', () => {
      expect(tracer.exportTrace('tr_missing')).toBe('');
    });
  });

  describe('end trace', () => {
    it('should complete the trace with ended_at and duration_ms', () => {
      const ctx = tracer.trace('end-test');
      ctx.span('negotiate').start().end();
      ctx.end();
      const trace = tracer.getTrace(ctx.id);
      expect(trace!.ended_at).toBeDefined();
      expect(trace!.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
