import type { SamplingConfig, SpanStatus } from './types.js';

export class Sampler {
  private config: SamplingConfig;

  constructor(config: SamplingConfig = { mode: 'all' }) {
    this.config = config;
  }

  shouldSample(status: SpanStatus = 'ok'): boolean {
    switch (this.config.mode) {
      case 'all':
        return true;
      case 'errors-first':
        if (status === 'error' || status === 'timeout') return true;
        // Success requests are sampled by percent
        const pct = this.config.percent ?? 10;
        return Math.random() * 100 < pct;
      case 'percent':
        return Math.random() * 100 < (this.config.percent ?? 10);
      case 'none':
        return false;
      default:
        return true;
    }
  }
}
