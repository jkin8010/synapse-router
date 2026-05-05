import { describe, it, expect } from 'vitest';
import { Redactor } from './redactor.js';

describe('Redactor', () => {
  describe('redactApiKey', () => {
    it('should redact long API keys showing first and last 4 chars', () => {
      const redactor = new Redactor();
      const result = redactor.redactApiKey('sk-1234567890abcdef');
      expect(result).toBe('sk-1***cdef');
    });

    it('should fully redact short keys (<= 8 chars)', () => {
      const redactor = new Redactor();
      const result = redactor.redactApiKey('short');
      expect(result).toBe('***');
    });

    it('should not redact when apiKeys is false', () => {
      const redactor = new Redactor({ apiKeys: false });
      const result = redactor.redactApiKey('sk-1234567890abcdef');
      expect(result).toBe('sk-1234567890abcdef');
    });
  });

  describe('redactInput', () => {
    it('should return full input when within length limit', () => {
      const redactor = new Redactor({ inputPreviewLength: 100 });
      const result = redactor.redactInput('short input');
      expect(result).toBe('short input');
    });

    it('should truncate long inputs', () => {
      const redactor = new Redactor({ inputPreviewLength: 10 });
      const longInput = 'a'.repeat(50);
      const result = redactor.redactInput(longInput);
      expect(result.length).toBe(10 + '... [truncated]'.length);
      expect(result).toContain('... [truncated]');
    });

    it('should return [redacted] when inputPreview is false', () => {
      const redactor = new Redactor({ inputPreview: false });
      const result = redactor.redactInput('secret input');
      expect(result).toBe('[redacted]');
    });

    it('should stringify non-string inputs', () => {
      const redactor = new Redactor();
      const result = redactor.redactInput({ key: 'value' });
      expect(result).toContain('key');
    });
  });

  describe('redactOutput', () => {
    it('should return full output when within length limit', () => {
      const redactor = new Redactor({ outputPreviewLength: 100 });
      const result = redactor.redactOutput('short output');
      expect(result).toBe('short output');
    });

    it('should truncate long outputs', () => {
      const redactor = new Redactor({ outputPreviewLength: 10 });
      const longOutput = 'b'.repeat(50);
      const result = redactor.redactOutput(longOutput);
      expect(result).toContain('... [truncated]');
    });

    it('should return [redacted] when outputPreview is false', () => {
      const redactor = new Redactor({ outputPreview: false });
      const result = redactor.redactOutput('some output');
      expect(result).toBe('[redacted]');
    });
  });

  describe('redactAttributes', () => {
    it('should redact api_key attributes', () => {
      const redactor = new Redactor();
      const result = redactor.redactAttributes({ api_key: 'sk-1234567890abcdef' });
      expect(result['api_key']).toBe('sk-1***cdef');
    });

    it('should redact apiKey attributes', () => {
      const redactor = new Redactor();
      const result = redactor.redactAttributes({ apiKey: 'sk-1234567890abcdef' });
      expect(result['apiKey']).toBe('sk-1***cdef');
    });

    it('should redact secret attributes', () => {
      const redactor = new Redactor();
      const result = redactor.redactAttributes({ secret: 'mysecretvalue12345' });
      expect(result['secret']).toBe('myse***2345');
    });

    it('should truncate input attributes', () => {
      const redactor = new Redactor({ inputPreviewLength: 5 });
      const result = redactor.redactAttributes({ input_data: 'a'.repeat(20) });
      expect(result['input_data']).toContain('... [truncated]');
    });

    it('should truncate output attributes', () => {
      const redactor = new Redactor({ outputPreviewLength: 5 });
      const result = redactor.redactAttributes({ output_data: 'b'.repeat(20) });
      expect(result['output_data']).toContain('... [truncated]');
    });

    it('should pass through non-sensitive attributes', () => {
      const redactor = new Redactor();
      const result = redactor.redactAttributes({ name: 'test', count: 42 });
      expect(result['name']).toBe('test');
      expect(result['count']).toBe(42);
    });
  });
});
