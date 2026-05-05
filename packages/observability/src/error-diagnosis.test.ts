import { describe, it, expect } from 'vitest';
import { diagnoseError } from './error-diagnosis.js';

describe('diagnoseError', () => {
  it('should diagnose AUTH_ERROR for 401 status', () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 });
    const result = diagnoseError(err);
    expect(result.type).toBe('AUTH_ERROR');
    expect(result.status).toBe(401);
    expect(result.hint).toContain('API Key');
    expect(result.fix_suggestion.length).toBeGreaterThan(0);
  });

  it('should diagnose AUTH_ERROR when status is in context', () => {
    const err = new Error('Unauthorized');
    const result = diagnoseError(err, { status: 401 });
    expect(result.type).toBe('AUTH_ERROR');
    expect(result.status).toBe(401);
  });

  it('should diagnose RATE_LIMIT for 429 status', () => {
    const err = Object.assign(new Error('Too Many Requests'), { status: 429 });
    const result = diagnoseError(err);
    expect(result.type).toBe('RATE_LIMIT');
    expect(result.status).toBe(429);
    expect(result.hint).toContain('速率限制');
  });

  it('should diagnose HTTP_ERROR for 500+ status', () => {
    const err = Object.assign(new Error('Internal Server Error'), { status: 500 });
    const result = diagnoseError(err);
    expect(result.type).toBe('HTTP_ERROR');
    expect(result.status).toBe(500);
  });

  it('should diagnose HTTP_ERROR for 503 status', () => {
    const err = Object.assign(new Error('Service Unavailable'), { status: 503 });
    const result = diagnoseError(err);
    expect(result.type).toBe('HTTP_ERROR');
  });

  it('should diagnose TIMEOUT for timeout message', () => {
    const err = new Error('Request timeout after 30s');
    const result = diagnoseError(err);
    expect(result.type).toBe('TIMEOUT');
    expect(result.hint).toContain('超时');
  });

  it('should diagnose TIMEOUT for TimeoutError name', () => {
    const err = new Error('Timed out');
    err.name = 'TimeoutError';
    const result = diagnoseError(err);
    expect(result.type).toBe('TIMEOUT');
  });

  it('should diagnose HTTP_ERROR for ECONNREFUSED', () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:3000');
    const result = diagnoseError(err);
    expect(result.type).toBe('HTTP_ERROR');
    expect(result.hint).toContain('base_url');
  });

  it('should diagnose HTTP_ERROR for ENOTFOUND', () => {
    const err = new Error('getaddrinfo ENOTFOUND api.example.com');
    const result = diagnoseError(err);
    expect(result.type).toBe('HTTP_ERROR');
  });

  it('should return UNKNOWN for unrecognized errors', () => {
    const err = new Error('Some random error');
    const result = diagnoseError(err);
    expect(result.type).toBe('UNKNOWN');
    expect(result.message).toBe('Some random error');
    expect(result.fix_suggestion.length).toBeGreaterThan(0);
  });

  it('should include stack trace', () => {
    const err = new Error('Test error');
    const result = diagnoseError(err);
    expect(result.stack).toBe(err.stack);
  });

  it('should include context in the result', () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 });
    const result = diagnoseError(err, { provider: 'deepseek', feature: 'chat' });
    expect(result.context).toEqual({ provider: 'deepseek', feature: 'chat' });
  });
});
