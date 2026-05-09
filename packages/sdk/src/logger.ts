import { appendFile } from "node:fs/promises";

export interface SynapseLoggerOptions {
  path: string;
  enabled?: boolean;
}

export interface SynapseLogEvent {
  t: string; // timestamp ISO
  p: string; // provider
  f: string; // feature
  status: string; // "ok" | "error" | "rate_limited"
  latency?: number; // ms
}

export class SynapseLogger {
  private path: string;
  private enabled: boolean;

  constructor(options: SynapseLoggerOptions) {
    this.path = options.path;
    this.enabled = options.enabled !== false;
  }

  async append(event: SynapseLogEvent): Promise<void> {
    if (!this.enabled) return;
    const line = JSON.stringify(event) + "\n";
    await appendFile(this.path, line, "utf8");
  }
}
