import type { TraceContext } from '../tracer.js';
import type { BillingSpanAttrs } from './types.js';

export function createBillingSpan(trace: TraceContext, attrs: BillingSpanAttrs) {
  return trace.span('billing').start(attrs as unknown as Record<string, unknown>);
}

export function wrapBilling<T extends (...args: any[]) => Promise<any>>(
  trace: TraceContext,
  fn: T,
  attrs: BillingSpanAttrs
): Promise<any> {
  const span = trace.span('billing').start(attrs as unknown as Record<string, unknown>);
  return fn().then(
    (result: any) => {
      span.end({
        actual_cost: result?.actualCost,
        quota_exceeded: result?.quotaUpdates?.some((q: any) => q.isExceeded),
      });
      return result;
    },
    (error: Error) => {
      span.recordError(error, attrs as unknown as Record<string, unknown>);
      span.end({ quota_exceeded: true });
      throw error;
    }
  );
}
