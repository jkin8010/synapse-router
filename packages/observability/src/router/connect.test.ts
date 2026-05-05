import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTracer } from '../tracer.js';
import { wrapConnect } from './connect.js';

describe('wrapConnect', () => {
  let tracer: ReturnType<typeof createTracer>;
  let trace: ReturnType<typeof tracer.trace>;

  beforeEach(() => {
    tracer = createTracer({ sampling: { mode: 'all' } });
    trace = tracer.trace('connect-test', 'sdk');
  });

  it('should end span with success attributes', async () => {
    const mockFn = vi.fn().mockResolvedValue({
      meta: {
        usage: { input_tokens: 10, output_tokens: 50 },
        latency_ms: 120,
      },
    });

    const result = await wrapConnect(trace, mockFn, {
      provider: 'deepseek',
      feature_id: 'chat',
    });

    expect(result.meta.usage.input_tokens).toBe(10);
    expect(result.meta.usage.output_tokens).toBe(50);

    const traceData = tracer.getTrace(trace.id);
    expect(traceData).toBeDefined();
    expect(traceData!.spans).toHaveLength(1);
    const span = traceData!.spans[0];
    expect(span.name).toBe('connect');
    expect(span.status).toBe('ok');
    expect(span.attributes.http_status).toBe(200);
  });

  it('should record error for 401 response', async () => {
    const mockFn = vi.fn().mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { status: 401 })
    );

    await expect(
      wrapConnect(trace, mockFn, {
        provider: 'deepseek',
        feature_id: 'chat',
      })
    ).rejects.toThrow('Unauthorized');

    const traceData = tracer.getTrace(trace.id);
    expect(traceData!.spans).toHaveLength(1);
    const span = traceData!.spans[0];
    expect(span.status).toBe('error');
    expect(span.error).toBeDefined();
    expect(span.error!.type).toBe('UNKNOWN'); // wrapConnect doesn't map error types
    expect(span.attributes.http_status).toBe(401);
    expect(span.attributes.error_type).toBe('AUTH_ERROR');
  });

  it('should record error for 429 response', async () => {
    const mockFn = vi.fn().mockRejectedValue(
      Object.assign(new Error('Rate Limited'), { status: 429 })
    );

    await expect(
      wrapConnect(trace, mockFn, {
        provider: 'openai',
        feature_id: 'chat',
      })
    ).rejects.toThrow('Rate Limited');

    const traceData = tracer.getTrace(trace.id);
    const span = traceData!.spans[0];
    expect(span.attributes.error_type).toBe('RATE_LIMIT');
    expect(span.attributes.http_status).toBe(429);
  });

  it('should record error for 500+ response', async () => {
    const mockFn = vi.fn().mockRejectedValue(
      Object.assign(new Error('Internal Server Error'), { status: 500 })
    );

    await expect(
      wrapConnect(trace, mockFn, {
        provider: 'anthropic',
        feature_id: 'chat',
      })
    ).rejects.toThrow('Internal Server Error');

    const traceData = tracer.getTrace(trace.id);
    const span = traceData!.spans[0];
    expect(span.attributes.error_type).toBe('HTTP_ERROR');
    expect(span.attributes.http_status).toBe(500);
  });

  it('should handle errors without status', async () => {
    const mockFn = vi.fn().mockRejectedValue(
      new Error('Network error')
    );

    await expect(
      wrapConnect(trace, mockFn, {
        provider: 'deepseek',
        feature_id: 'chat',
      })
    ).rejects.toThrow('Network error');

    const traceData = tracer.getTrace(trace.id);
    const span = traceData!.spans[0];
    expect(span.status).toBe('error');
    expect(span.attributes.http_status).toBeUndefined();
    expect(span.attributes.error_type).toBe('UNKNOWN');
  });
});
