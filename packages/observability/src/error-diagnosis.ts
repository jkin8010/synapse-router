import type { TraceError } from './types.js';

// Error diagnosis rules
interface DiagnosisRule {
  match: (error: Error, context?: Record<string, unknown>) => boolean;
  diagnose: (error: Error, context?: Record<string, unknown>) => TraceError;
}

const rules: DiagnosisRule[] = [
  {
    match: (err, ctx) => {
      const status = (err as any).status || (ctx as any)?.status;
      return status === 401;
    },
    diagnose: (err, ctx) => ({
      type: 'AUTH_ERROR',
      message: err.message,
      status: 401,
      hint: 'API Key 无效或已过期',
      fix_suggestion: [
        '检查 vault 中的 key: synapse vault verify <provider>',
        '到 Provider 控制台确认 key 状态',
        '如果 key 过期: synapse vault set <provider> <new_key>',
      ],
      context: ctx || {},
      stack: err.stack,
    }),
  },
  {
    match: (err, ctx) => {
      const status = (err as any).status || (ctx as any)?.status;
      return status === 429;
    },
    diagnose: (err, ctx) => ({
      type: 'RATE_LIMIT',
      message: err.message,
      status: 429,
      hint: 'Provider 速率限制，请求过于频繁',
      fix_suggestion: [
        '等待后重试（检查 Retry-After header）',
        '降低调用频率',
        '考虑升级 Provider 套餐获取更高限额',
      ],
      context: ctx || {},
      stack: err.stack,
    }),
  },
  {
    match: (err, ctx) => {
      const status = (err as any).status || (ctx as any)?.status;
      return status >= 500 && status < 600;
    },
    diagnose: (err, ctx) => ({
      type: 'HTTP_ERROR',
      message: err.message,
      status: (err as any).status,
      hint: 'Provider 服务端错误',
      fix_suggestion: [
        '检查 Provider 状态页面',
        '稍后重试',
        '如果持续失败，尝试切换到备选 Provider',
      ],
      context: ctx || {},
      stack: err.stack,
    }),
  },
  {
    match: (err) => err.message.includes('timeout') || err.name === 'TimeoutError',
    diagnose: (err, ctx) => ({
      type: 'TIMEOUT',
      message: err.message,
      hint: '请求超时，Provider 响应过慢',
      fix_suggestion: [
        '检查网络连接',
        '尝试减小请求量（如减少 max_tokens）',
        '切换到响应更快的 Provider',
      ],
      context: ctx || {},
      stack: err.stack,
    }),
  },
  {
    match: (err) => err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND'),
    diagnose: (err, ctx) => ({
      type: 'HTTP_ERROR',
      message: err.message,
      hint: '无法连接到 Provider API，检查 base_url 配置',
      fix_suggestion: [
        '检查 base_url 配置是否正确',
        '确认网络连接正常',
        '检查 DNS 解析: nslookup <domain>',
      ],
      context: ctx || {},
      stack: err.stack,
    }),
  },
];

export function diagnoseError(error: Error, context?: Record<string, unknown>): TraceError {
  for (const rule of rules) {
    if (rule.match(error, context)) {
      return rule.diagnose(error, context);
    }
  }
  // Fallback
  return {
    type: 'UNKNOWN',
    message: error.message,
    hint: '未知错误，查看 trace 详情获取更多信息',
    fix_suggestion: [
      '检查 trace 日志: synapse traces show <trace_id>',
      '导出 trace 给 Coding Agent 分析: synapse traces export <trace_id>',
    ],
    context: context || {},
    stack: error.stack,
  };
}
