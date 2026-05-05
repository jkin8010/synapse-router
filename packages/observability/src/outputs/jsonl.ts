import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { TraceEvent } from '../types.js';

export class JsonlOutput {
  private filePath: string;

  constructor(outputDir?: string) {
    const dir = outputDir || path.join(os.homedir(), '.synapse', 'traces');
    const date = new Date().toISOString().slice(0, 10);
    this.filePath = path.join(dir, `${date}.jsonl`);
    fs.mkdirSync(dir, { recursive: true });
  }

  write(event: TraceEvent): void {
    fs.appendFileSync(this.filePath, JSON.stringify(event) + '\n');
  }

  read(filter?: { trace_id?: string; since?: string }): TraceEvent[] {
    if (!fs.existsSync(this.filePath)) return [];
    const lines = fs.readFileSync(this.filePath, 'utf8').split('\n').filter(Boolean);
    let events = lines.map(line => JSON.parse(line) as TraceEvent);
    if (filter?.trace_id) {
      events = events.filter(e => e.trace_id === filter.trace_id);
    }
    if (filter?.since) {
      const since = filter.since;
      events = events.filter(e => e.timestamp >= since);
    }
    return events;
  }
}
