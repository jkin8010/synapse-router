import { writeFileSync, renameSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Quota, QuotaStorage } from "./types.js";

/**
 * File-based implementation of QuotaStorage.
 *
 * Persists quota state to ~/.synapse/quotas/<provider>.json.
 * Uses atomic .tmp + rename pattern to prevent corrupt files on crash.
 * Uses synchronous I/O to match QuotaStorage.saveQuota() return type (void).
 *
 * Supports env-var override for test isolation: SYNAPSE_QUOTA_DIR
 *
 * CRITICAL: saveQuota() is synchronous because QuotaManager.consume()
 * calls it without await (quota.ts:71).
 */
export class FileQuotaStorage implements QuotaStorage {
  private cache: Map<string, Quota> = new Map();
  private filePath: string;

  constructor(providerId: string) {
    const dir = process.env.SYNAPSE_QUOTA_DIR ?? join(homedir(), ".synapse", "quotas");
    mkdirSync(dir, { recursive: true });
    this.filePath = join(dir, `${providerId}.json`);
    this.load();
  }

  getQuota(quotaId: string): Quota | undefined {
    return this.cache.get(quotaId);
  }

  /**
   * Saves quota to memory and immediately flushes to disk.
   * Must be synchronous -- called without await in QuotaManager.consume().
   */
  saveQuota(quota: Quota): void {
    this.cache.set(quota.id, { ...quota });
    this.flush();
  }

  /**
   * Required by QuotaManager via cast at quota.ts:100,158.
   * QuotaManager accesses storage as `(this.storage as any).getAll?.()`.
   */
  getAll(): Quota[] {
    return Array.from(this.cache.values());
  }

  /**
   * Load quotas from disk into memory cache.
   * Handles corrupt files gracefully (starts with empty cache).
   */
  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const entries = JSON.parse(raw) as Record<string, Quota>;
      for (const [id, quota] of Object.entries(entries)) {
        this.cache.set(id, quota);
      }
    } catch {
      // File corrupt or unreadable -- start with empty cache
    }
  }

  /**
   * Atomic flush: write to .tmp file, then rename to target path.
   * Prevents partial/corrupt writes if the process crashes mid-write.
   */
  private flush(): void {
    const data = JSON.stringify(Object.fromEntries(this.cache), null, 2);
    const tmpPath = this.filePath + ".tmp";
    writeFileSync(tmpPath, data, "utf-8");
    renameSync(tmpPath, this.filePath);
  }
}
