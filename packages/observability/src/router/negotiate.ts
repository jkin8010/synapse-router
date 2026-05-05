import type { TraceContext } from '../tracer.js';
import type { NegotiateSpanAttrs } from './types.js';

export function createNegotiateSpan(trace: TraceContext, attrs: NegotiateSpanAttrs) {
  return trace.span('negotiate').start(attrs as unknown as Record<string, unknown>);
}

export function wrapNegotiate<T extends (...args: any[]) => any>(
  trace: TraceContext,
  fn: T,
  attrs: NegotiateSpanAttrs
): ReturnType<T> {
  const span = trace.span('negotiate').start(attrs as unknown as Record<string, unknown>);
  try {
    const result = fn();
    if (result && typeof (result as Promise<any>).then === 'function') {
      return (result as Promise<any>).then(
        (r: any) => { span.end({ accepted_count: r?.accepted?.length || 0, rejected_count: r?.rejected?.length || 0 }); return r; },
        (e: Error) => { span.recordError(e); span.end(); throw e; }
      ) as ReturnType<T>;
    }
    span.end({ accepted_count: result?.accepted?.length || 0, rejected_count: result?.rejected?.length || 0 });
    return result;
  } catch (e) {
    span.recordError(e as Error);
    span.end();
    throw e;
  }
}
