import type { TraceContext } from '../tracer.js';
import type { ConnectSpanAttrs } from './types.js';

export function createConnectSpan(trace: TraceContext, attrs: ConnectSpanAttrs) {
  return trace.span('connect').start(attrs as unknown as Record<string, unknown>);
}

export function wrapConnect<T extends (...args: any[]) => Promise<any>>(
  trace: TraceContext,
  fn: T,
  attrs: ConnectSpanAttrs
): Promise<any> {
  const span = trace.span('connect').start(attrs as unknown as Record<string, unknown>);
  return fn().then(
    (result: any) => {
      const usage = result?.meta?.usage;
      span.end({
        http_status: 200,
        latency_ms: result?.meta?.latency_ms,
        input_tokens: usage?.input_tokens,
        output_tokens: usage?.output_tokens,
      });
      return result;
    },
    (error: Error) => {
      const statusCode = (error as any).status;
      let errorType = 'UNKNOWN';
      if (statusCode === 401) errorType = 'AUTH_ERROR';
      else if (statusCode === 429) errorType = 'RATE_LIMIT';
      else if (statusCode >= 500) errorType = 'HTTP_ERROR';

      span.recordError(error, { error_type: errorType, ...attrs });
      span.end({ http_status: statusCode, error_type: errorType });
      throw error;
    }
  );
}
