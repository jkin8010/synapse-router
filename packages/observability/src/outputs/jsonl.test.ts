import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { JsonlOutput } from './jsonl.js';
import type { TraceEvent } from './types.js';

describe('JsonlOutput', () => {
  let testDir: string;
  let jsonl: JsonlOutput;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), 'synapse-test-traces');
    // Clean up any previous test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should create the output directory', () => {
    expect(fs.existsSync(testDir)).toBe(false);
    new JsonlOutput(testDir);
    expect(fs.existsSync(testDir)).toBe(true);
  });

  it('should write events to a JSONL file', () => {
    jsonl = new JsonlOutput(testDir);
    const event: TraceEvent = {
      trace_id: 'tr_test123',
      span_name: 'negotiate',
      type: 'span_end',
      timestamp: '2026-05-04T12:00:00.000Z',
      attributes: { status: 'ok' },
    };
    jsonl.write(event);
    const events = jsonl.read();
    expect(events).toHaveLength(1);
    expect(events[0].trace_id).toBe('tr_test123');
    expect(events[0].span_name).toBe('negotiate');
  });

  it('should append multiple events', () => {
    jsonl = new JsonlOutput(testDir);
    jsonl.write({
      trace_id: 'tr_1',
      type: 'event1',
      timestamp: '2026-05-04T12:00:00.000Z',
      attributes: {},
    });
    jsonl.write({
      trace_id: 'tr_2',
      type: 'event2',
      timestamp: '2026-05-04T12:01:00.000Z',
      attributes: {},
    });
    const events = jsonl.read();
    expect(events).toHaveLength(2);
  });

  it('should filter by trace_id', () => {
    jsonl = new JsonlOutput(testDir);
    jsonl.write({
      trace_id: 'tr_a',
      type: 'event',
      timestamp: '2026-05-04T12:00:00.000Z',
      attributes: {},
    });
    jsonl.write({
      trace_id: 'tr_b',
      type: 'event',
      timestamp: '2026-05-04T12:01:00.000Z',
      attributes: {},
    });
    const filtered = jsonl.read({ trace_id: 'tr_a' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].trace_id).toBe('tr_a');
  });

  it('should filter by since timestamp', () => {
    jsonl = new JsonlOutput(testDir);
    jsonl.write({
      trace_id: 'tr_old',
      type: 'event',
      timestamp: '2026-05-04T10:00:00.000Z',
      attributes: {},
    });
    jsonl.write({
      trace_id: 'tr_new',
      type: 'event',
      timestamp: '2026-05-04T14:00:00.000Z',
      attributes: {},
    });
    const filtered = jsonl.read({ since: '2026-05-04T12:00:00.000Z' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].trace_id).toBe('tr_new');
  });

  it('should return empty array when file does not exist', () => {
    // Create JsonlOutput in a non-existing dir, but don't write anything
    const emptyDir = path.join(os.tmpdir(), 'synapse-test-empty');
    const emptyJsonl = new JsonlOutput(emptyDir);
    // The file won't exist because we didn't write
    const events = emptyJsonl.read();
    expect(events).toEqual([]);
    if (fs.existsSync(emptyDir)) {
      fs.rmSync(emptyDir, { recursive: true });
    }
  });

  it('should use default path when no outputDir is provided', () => {
    const defaultJsonl = new JsonlOutput();
    expect(defaultJsonl).toBeDefined();
  });
});
