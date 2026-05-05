import type { TraceContext } from '../tracer.js';
import type { LockSpanAttrs } from './types.js';

export function createLockSpan(trace: TraceContext, attrs: LockSpanAttrs) {
  return trace.span('lock').start(attrs as unknown as Record<string, unknown>);
}

export function wrapLockCheck<T extends (...args: any[]) => any>(
  trace: TraceContext,
  fn: T,
  attrs: LockSpanAttrs
): ReturnType<T> {
  const span = trace.span('lock').start(attrs as unknown as Record<string, unknown>);
  try {
    const result = fn();
    if (result && typeof (result as Promise<any>).then === 'function') {
      return (result as Promise<any>).then(
        (r: any) => { span.end({ cache_hit: r?.cache_hit ?? true, lock_id: r?.lock_id }); return r; },
        (e: Error) => { span.recordError(e); span.end(); throw e; }
      ) as ReturnType<T>;
    }
    span.end({ cache_hit: true });
    return result;
  } catch (e) {
    span.recordError(e as Error);
    span.end();
    throw e;
  }
}
