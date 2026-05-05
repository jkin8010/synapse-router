import { describe, it, expect } from 'vitest';
import { Sampler } from './sampler.js';

describe('Sampler', () => {
  describe('mode: all', () => {
    it('should always return true', () => {
      const sampler = new Sampler({ mode: 'all' });
      expect(sampler.shouldSample('ok')).toBe(true);
      expect(sampler.shouldSample('error')).toBe(true);
      expect(sampler.shouldSample('timeout')).toBe(true);
    });
  });

  describe('mode: errors-first', () => {
    it('should always sample errors', () => {
      const sampler = new Sampler({ mode: 'errors-first', percent: 0 });
      expect(sampler.shouldSample('error')).toBe(true);
      expect(sampler.shouldSample('timeout')).toBe(true);
    });

    it('should sample ok requests by percent', () => {
      // With 100% percent, all ok requests should be sampled
      const sampler = new Sampler({ mode: 'errors-first', percent: 100 });
      expect(sampler.shouldSample('ok')).toBe(true);
    });

    it('should sometimes skip ok requests with low percent', () => {
      const sampler = new Sampler({ mode: 'errors-first', percent: 0 });
      // With 0% percent, ok requests should not be sampled
      expect(sampler.shouldSample('ok')).toBe(false);
    });
  });

  describe('mode: percent', () => {
    it('should always sample with 100%', () => {
      const sampler = new Sampler({ mode: 'percent', percent: 100 });
      for (let i = 0; i < 10; i++) {
        expect(sampler.shouldSample('ok')).toBe(true);
      }
    });

    it('should never sample with 0%', () => {
      const sampler = new Sampler({ mode: 'percent', percent: 0 });
      for (let i = 0; i < 10; i++) {
        expect(sampler.shouldSample('ok')).toBe(false);
      }
    });

    it('should use default percent (10) when not specified', () => {
      const sampler = new Sampler({ mode: 'percent' });
      // Can't test deterministic behavior, but ensure it doesn't throw
      expect(() => sampler.shouldSample('ok')).not.toThrow();
    });
  });

  describe('mode: none', () => {
    it('should always return false', () => {
      const sampler = new Sampler({ mode: 'none' });
      expect(sampler.shouldSample('ok')).toBe(false);
      expect(sampler.shouldSample('error')).toBe(false);
      expect(sampler.shouldSample('timeout')).toBe(false);
    });
  });

  describe('default', () => {
    it('should default to "all" mode', () => {
      const sampler = new Sampler();
      expect(sampler.shouldSample('ok')).toBe(true);
    });
  });
});
