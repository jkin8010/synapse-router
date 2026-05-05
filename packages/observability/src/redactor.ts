import type { RedactConfig } from './types.js';

const DEFAULT_REDACT: Required<RedactConfig> = {
  apiKeys: true,
  inputPreview: true,
  outputPreview: true,
  inputPreviewLength: 100,
  outputPreviewLength: 200,
};

export class Redactor {
  private config: Required<RedactConfig>;

  constructor(config?: RedactConfig) {
    this.config = { ...DEFAULT_REDACT, ...config };
  }

  redactApiKey(key: string): string {
    if (!this.config.apiKeys) return key;
    if (key.length <= 8) return '***';
    return key.slice(0, 4) + '***' + key.slice(-4);
  }

  redactInput(input: unknown): string {
    if (!this.config.inputPreview) return '[redacted]';
    const str = typeof input === 'string' ? input : JSON.stringify(input);
    if (str.length <= this.config.inputPreviewLength) return str;
    return str.slice(0, this.config.inputPreviewLength) + '... [truncated]';
  }

  redactOutput(output: unknown): string {
    if (!this.config.outputPreview) return '[redacted]';
    const str = typeof output === 'string' ? output : JSON.stringify(output);
    if (str.length <= this.config.outputPreviewLength) return str;
    return str.slice(0, this.config.outputPreviewLength) + '... [truncated]';
  }

  redactAttributes(attrs: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (key.includes('api_key') || key.includes('apiKey') || key.includes('secret')) {
        result[key] = typeof value === 'string' ? this.redactApiKey(value) : '[redacted]';
      } else if (key.includes('input') && this.config.inputPreview) {
        result[key] = this.redactInput(value);
      } else if (key.includes('output') && this.config.outputPreview) {
        result[key] = this.redactOutput(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
