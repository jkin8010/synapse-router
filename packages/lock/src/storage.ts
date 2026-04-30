/**
 * Schema Lock 本地文件存储
 * 目录: ~/.synapse/schemas/
 */

import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { SchemaLock } from "./lock.js";
import { computeCacheKey } from "./lock.js";

export class LockStorage {
  constructor(private schemasDir: string) {}

  /**
   * 确保目录存在
   */
  private async ensureDir(): Promise<void> {
    await mkdir(this.schemasDir, { recursive: true });
  }

  /**
   * 生成文件名: {cacheKey}.lock.json
   */
  private getFileName(lock: SchemaLock): string {
    const cacheKey = computeCacheKey(lock.intent, lock.provider, lock.pack_version);
    return `${cacheKey}.lock.json`;
  }

  /**
   * 保存 Lock 到本地文件
   */
  async save(lock: SchemaLock): Promise<void> {
    await this.ensureDir();
    const fileName = this.getFileName(lock);
    const filePath = join(this.schemasDir, fileName);
    await writeFile(filePath, JSON.stringify(lock, null, 2) + "\n", "utf8");
  }

  /**
   * 通过 lock_id 加载 Lock
   */
  async load(lockId: string): Promise<SchemaLock | null> {
    await this.ensureDir();
    const locks = await this.list();
    return locks.find((l) => l.lock_id === lockId) ?? null;
  }

  /**
   * 通过缓存 key 查找 Lock
   */
  async findByCacheKey(
    intent: string,
    provider: string,
    packVersion: string
  ): Promise<SchemaLock | null> {
    const cacheKey = computeCacheKey(intent, provider, packVersion);
    const filePath = join(this.schemasDir, `${cacheKey}.lock.json`);

    try {
      const content = await readFile(filePath, "utf8");
      return JSON.parse(content) as SchemaLock;
    } catch {
      return null;
    }
  }

  /**
   * 列出所有缓存的 Lock
   */
  async list(): Promise<SchemaLock[]> {
    await this.ensureDir();

    let entries: string[];
    try {
      entries = await readdir(this.schemasDir);
    } catch {
      return [];
    }

    const locks: SchemaLock[] = [];

    for (const entry of entries) {
      if (!entry.endsWith(".lock.json")) continue;
      try {
        const content = await readFile(join(this.schemasDir, entry), "utf8");
        locks.push(JSON.parse(content) as SchemaLock);
      } catch {
        // skip malformed files
      }
    }

    return locks;
  }

  /**
   * 标记 Lock 为 deprecated
   */
  async deprecate(lockId: string, migratedTo?: string): Promise<void> {
    const lock = await this.load(lockId);
    if (!lock) {
      throw new Error(`Lock not found: ${lockId}`);
    }

    lock.status = "deprecated";
    if (migratedTo) {
      lock.migrated_to = migratedTo;
    }

    await this.save(lock);
  }

  /**
   * 删除 Lock 文件
   */
  async remove(lockId: string): Promise<boolean> {
    const locks = await this.list();
    const lock = locks.find((l) => l.lock_id === lockId);
    if (!lock) return false;

    const fileName = this.getFileName(lock);
    const filePath = join(this.schemasDir, fileName);

    try {
      await unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
