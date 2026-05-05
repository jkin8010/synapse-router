import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTracer } from '../tracer.js';
import { wrapNegotiate } from './negotiate.js';

describe('wrapNegotiate', () => {
  let tracer: ReturnType<typeof createTracer>;
  let trace: ReturnType<typeof tracer.trace>;

  beforeEach(() => {
    tracer = createTracer({ sampling: { mode: 'all' } });
    trace = tracer.trace('negotiate-test', 'sdk');
  });

  it('should end span with accepted/rejected counts for sync function', () => {
    const mockFn = vi.fn().mockReturnValue({
      accepted: [{ provider: 'deepseek', feature: 'chat' }],
      rejected: [{ provider: 'other', reason: 'no match' }],
    });

    const result = wrapNegotiate(trace, mockFn, {
      agent_schema: { name: 'test' },
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);

    const traceData = tracer.getTrace(trace.id);
    expect(traceData!.spans).toHaveLength(1);
    const span = traceData!.spans[0];
    expect(span.name).toBe('negotiate');
    expect(span.attributes.accepted_count).toBe(1);
    expect(span.attributes.rejected_count).toBe(1);
  });

  it('should end span with counts for async function', async () => {
    const mockFn = vi.fn().mockResolvedValue({
      accepted: [{ provider: 'openai' }, { provider: 'deepseek' }],
      rejected: [],
    });

    const result = await wrapNegotiate(trace, mockFn, {
      agent_schema: { name: 'async-test' },
    });

    expect(result.accepted).toHaveLength(2);

    const traceData = tracer.getTrace(trace.id);
    const span = traceData!.spans[0];
    expect(span.attributes.accepted_count).toBe(2);
    expect(span.attributes.rejected_count).toBe(0);
  });

  it('should record error when sync function throws', () => {
    const mockFn = vi.fn().mockImplementation(() => {
      throw new Error('Negotiation failed');
    });

    expect(() =>
      wrapNegotiate(trace, mockFn, {
        agent_schema: { name: 'error-test' },
      })
    ).toThrow('Negotiation failed');

    const traceData = tracer.getTrace(trace.id);
    const span = traceData!.spans[0];
    expect(span.status).toBe('error');
    expect(span.error).toBeDefined();
    expect(span.error!.message).toBe('Negotiation failed');
  });

  it('should record error when async function rejects', async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error('Async negotiation failed'));

    await expect(
      wrapNegotiate(trace, mockFn, {
        agent_schema: { name: 'async-error' },
      })
    ).rejects.toThrow('Async negotiation failed');

    const traceData = tracer.getTrace(trace.id);
    const span = traceData!.spans[0];
    expect(span.status).toBe('error');
    expect(span.error!.message).toBe('Async negotiation failed');
  });

  it('should handle empty results gracefully', () => {
    const mockFn = vi.fn().mockReturnValue(null);

    const result = wrapNegotiate(trace, mockFn, {
      agent_schema: { name: 'null-test' },
    });

    expect(result).toBeNull();

    const traceData = tracer.getTrace(trace.id);
    const span = traceData!.spans[0];
    expect(span.attributes.accepted_count).toBe(0);
    expect(span.attributes.rejected_count).toBe(0);
  });
});
