import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { writeFileSync, existsSync, mkdirSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileQuotaStorage } from "./file-storage.js";
import type { Quota } from "./types.js";

describe("FileQuotaStorage", () => {
  let tempDir: string;
  let storage: FileQuotaStorage;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "synapse-quota-test-"));
    process.env.SYNAPSE_QUOTA_DIR = tempDir;
    storage = new FileQuotaStorage("test-provider");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env.SYNAPSE_QUOTA_DIR;
  });

  describe("getQuota", () => {
    it("returns undefined for non-existent quota", () => {
      const result = storage.getQuota("nonexistent");
      assert.strictEqual(result, undefined);
    });

    it("returns a quota after save", () => {
      const quota: Quota = {
        id: "test-q-1",
        type: "cost",
        limit: 100,
        used: 0,
        period: "month",
      };
      storage.saveQuota(quota);
      const retrieved = storage.getQuota("test-q-1");
      assert.ok(retrieved);
      assert.strictEqual(retrieved.id, "test-q-1");
      assert.strictEqual(retrieved.limit, 100);
      assert.strictEqual(retrieved.used, 0);
    });
  });

  describe("saveQuota", () => {
    it("persists quota to memory and retrieves it", () => {
      const quota: Quota = {
        id: "test-q-2",
        type: "cost",
        limit: 100,
        used: 25,
        period: "month",
        threshold: 0.8,
      };
      storage.saveQuota(quota);
      const retrieved = storage.getQuota("test-q-2");
      assert.ok(retrieved);
      assert.strictEqual(retrieved.id, "test-q-2");
      assert.strictEqual(retrieved.type, "cost");
      assert.strictEqual(retrieved.limit, 100);
      assert.strictEqual(retrieved.used, 25);
      assert.strictEqual(retrieved.period, "month");
      assert.strictEqual(retrieved.threshold, 0.8);
    });

    it("updates existing quota", () => {
      const quota: Quota = {
        id: "test-q-3",
        type: "cost",
        limit: 100,
        used: 10,
        period: "month",
      };
      storage.saveQuota(quota);

      const updated: Quota = {
        id: "test-q-3",
        type: "cost",
        limit: 100,
        used: 50,
        period: "month",
      };
      storage.saveQuota(updated);

      const retrieved = storage.getQuota("test-q-3");
      assert.ok(retrieved);
      assert.strictEqual(retrieved.used, 50);
    });

    it("writes to disk (file exists after save)", () => {
      const quota: Quota = {
        id: "test-q-4",
        type: "cost",
        limit: 100,
        used: 0,
        period: "oneTime",
      };
      storage.saveQuota(quota);

      const filePath = join(tempDir, "test-provider.json");
      assert.ok(existsSync(filePath));
    });

    it("writes atomically (no .tmp file remains after save)", () => {
      const quota: Quota = {
        id: "test-q-5",
        type: "cost",
        limit: 100,
        used: 0,
        period: "oneTime",
      };
      storage.saveQuota(quota);

      const tmpFilePath = join(tempDir, "test-provider.json.tmp");
      assert.ok(!existsSync(tmpFilePath));
    });

    it("clones quota to avoid reference mutation", () => {
      const quota: Quota = {
        id: "test-q-6",
        type: "cost",
        limit: 100,
        used: 10,
        period: "oneTime",
      };
      storage.saveQuota(quota);

      // Mutate the original reference
      quota.used = 999;

      const retrieved = storage.getQuota("test-q-6");
      assert.ok(retrieved);
      assert.strictEqual(retrieved.used, 10);
    });
  });

  describe("getAll", () => {
    it("returns all cached quotas", () => {
      const q1: Quota = {
        id: "quota-a",
        type: "cost",
        limit: 100,
        used: 10,
        period: "month",
      };
      const q2: Quota = {
        id: "quota-b",
        type: "requests",
        limit: 1000,
        used: 50,
        period: "day",
      };
      storage.saveQuota(q1);
      storage.saveQuota(q2);

      const all = storage.getAll();
      assert.strictEqual(all.length, 2);
      const ids = all.map((q) => q.id).sort();
      assert.deepStrictEqual(ids, ["quota-a", "quota-b"]);
    });
  });

  describe("persistence across instances", () => {
    it("survives instance recreation (reads from disk)", () => {
      // Create first storage instance and save a quota
      const storage1 = new FileQuotaStorage("test-persist");
      const quota: Quota = {
        id: "persist-q",
        type: "cost",
        limit: 200,
        used: 42,
        period: "month",
      };
      storage1.saveQuota(quota);

      // Create second storage instance with same providerId (same dir)
      const storage2 = new FileQuotaStorage("test-persist");
      const retrieved = storage2.getQuota("persist-q");
      assert.ok(retrieved);
      assert.strictEqual(retrieved.id, "persist-q");
      assert.strictEqual(retrieved.limit, 200);
      assert.strictEqual(retrieved.used, 42);
    });
  });

  describe("corrupt file recovery", () => {
    it("handles corrupt JSON by starting with empty cache", () => {
      const filePath = join(tempDir, "test-corrupt.json");
      writeFileSync(filePath, "not-valid-json{{{}}", "utf-8");

      const corruptStorage = new FileQuotaStorage("test-corrupt");
      const result = corruptStorage.getQuota("any-key");
      assert.strictEqual(result, undefined);

      // Verify we can still write to it
      const quota: Quota = {
        id: "after-corrupt",
        type: "cost",
        limit: 50,
        used: 0,
        period: "oneTime",
      };
      corruptStorage.saveQuota(quota);
      const retrieved = corruptStorage.getQuota("after-corrupt");
      assert.ok(retrieved);
      assert.strictEqual(retrieved.limit, 50);
    });

    it("handles non-existent parent directory (first run)", () => {
      const deepDir = join(tmpdir(), "new-deep", "nested", "quotas");
      process.env.SYNAPSE_QUOTA_DIR = deepDir;

      const firstRunStorage = new FileQuotaStorage("first-run");
      const quota: Quota = {
        id: "first-run-q",
        type: "requests",
        limit: 500,
        used: 0,
        period: "day",
      };

      // Should not throw
      firstRunStorage.saveQuota(quota);
      const retrieved = firstRunStorage.getQuota("first-run-q");
      assert.ok(retrieved);
      assert.strictEqual(retrieved.id, "first-run-q");
    });
  });
});
