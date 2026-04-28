import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { FileAuditLogger, NoopAuditLogger } from "./audit.js";
import { createVault } from "./index.js";

let tmpDir: string;

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vault-audit-test-"));
}

describe("FileAuditLogger", () => {
  before(() => {
    tmpDir = makeTmpDir();
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("log appends a JSONL line", () => {
    const logger = new FileAuditLogger(tmpDir);
    logger.log({ action: "set_key", provider: "openai", success: true });

    const auditFile = path.join(tmpDir, "audit.jsonl");
    assert.ok(fs.existsSync(auditFile));
    const lines = fs.readFileSync(auditFile, "utf8").split("\n").filter(Boolean);
    assert.equal(lines.length, 1);

    const event = JSON.parse(lines[0]);
    assert.equal(event.action, "set_key");
    assert.equal(event.provider, "openai");
    assert.equal(event.success, true);
    assert.ok(event.timestamp);
  });

  it("log appends multiple lines without overwriting", () => {
    const logger = new FileAuditLogger(tmpDir);
    logger.clear(); // Start fresh — tmpDir is shared across tests in this describe block
    logger.log({ action: "set_key", provider: "openai", success: true });
    logger.log({ action: "get_key", provider: "openai", success: true });
    logger.log({ action: "remove_key", provider: "openai", success: true });

    const auditFile = path.join(tmpDir, "audit.jsonl");
    const lines = fs.readFileSync(auditFile, "utf8").split("\n").filter(Boolean);
    assert.equal(lines.length, 3);
  });

  it("getEvents with no filter returns all events", () => {
    const logger = new FileAuditLogger(tmpDir);
    logger.clear();
    logger.log({ action: "set_key", provider: "openai", success: true });
    logger.log({ action: "get_key", provider: "openai", success: true });
    const events = logger.getEvents();
    assert.ok(events.length >= 2);
  });

  it("getEvents filters by action", () => {
    const logger = new FileAuditLogger(tmpDir);
    logger.clear();
    logger.log({ action: "set_key", provider: "openai", success: true });
    logger.log({ action: "get_key", provider: "openai", success: true });
    logger.log({ action: "remove_key", provider: "openai", success: true });

    const setEvents = logger.getEvents({ action: "set_key" });
    assert.equal(setEvents.length, 1);
    assert.equal(setEvents[0].action, "set_key");
  });

  it("getEvents filters by provider", () => {
    const logger = new FileAuditLogger(tmpDir);
    logger.clear();
    logger.log({ action: "set_key", provider: "openai", success: true });
    logger.log({ action: "set_key", provider: "replicate", success: true });

    const openaiEvents = logger.getEvents({ provider: "openai" });
    assert.equal(openaiEvents.length, 1);
    assert.equal(openaiEvents[0].provider, "openai");
  });

  it("getEvents filters by since (ISO timestamp)", async () => {
    const logger = new FileAuditLogger(tmpDir);
    logger.clear(); // Clear any previous audit lines from other tests
    // Wait a little bit to ensure timestamps are distinct
    await new Promise((r) => setTimeout(r, 10));
    logger.log({ action: "set_key", provider: "openai", success: true });
    await new Promise((r) => setTimeout(r, 10));
    const sinceTime = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 10));
    logger.log({ action: "get_key", provider: "replicate", success: true });
    logger.log({ action: "remove_key", provider: "anthropic", success: true });

    const events = logger.getEvents({ since: sinceTime });
    assert.equal(events.length, 2);
    assert.equal(events[0].action, "get_key");
    assert.equal(events[1].action, "remove_key");
  });

  it("clear removes the audit file", () => {
    const logger = new FileAuditLogger(tmpDir);
    logger.log({ action: "set_key", provider: "openai", success: true });
    const auditFile = path.join(tmpDir, "audit.jsonl");
    assert.ok(fs.existsSync(auditFile));

    logger.clear();
    assert.ok(!fs.existsSync(auditFile));
  });

  it("getEvents returns empty array when file does not exist", () => {
    const logger = new FileAuditLogger(path.join(tmpDir, "nonexistent"));
    const events = logger.getEvents();
    assert.deepEqual(events, []);
  });

  it("multiple getEvents calls without log do not duplicate entries", () => {
    const logger = new FileAuditLogger(tmpDir);
    logger.clear();
    logger.log({ action: "set_key", provider: "openai", success: true });

    const events1 = logger.getEvents();
    const events2 = logger.getEvents();
    // Both reads should return the same entries (file is not consumed)
    assert.equal(events1.length, events2.length);
  });
});

describe("NoopAuditLogger", () => {
  it("log does not throw", () => {
    const logger = new NoopAuditLogger();
    logger.log({ action: "set_key", provider: "openai", success: true });
  });

  it("getEvents returns empty array", () => {
    const logger = new NoopAuditLogger();
    assert.deepEqual(logger.getEvents(), []);
  });

  it("clear does not throw", () => {
    const logger = new NoopAuditLogger();
    logger.clear();
  });
});

describe("Vault with audit=true", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("setKey produces an audit event", async () => {
    const vault = createVault({ vaultDir: dir, encryptionKey: "pw", audit: true });
    await vault.setKey("openai", "sk-test-key-1234567890abcdef", "Bearer");

    const auditFile = path.join(dir, "audit.jsonl");
    assert.ok(fs.existsSync(auditFile));
    const lines = fs.readFileSync(auditFile, "utf8").split("\n").filter(Boolean);
    const setEvents = lines
      .map((l) => JSON.parse(l))
      .filter((e) => e.action === "set_key" && e.provider === "openai");
    assert.ok(setEvents.length >= 1, "Should have at least one set_key event for openai");
    assert.equal(setEvents[0].success, true);
  });

  it("getKey produces an audit event", async () => {
    const vault = createVault({ vaultDir: dir, encryptionKey: "pw", audit: true });
    await vault.setKey("openai", "sk-test-key-1234567890abcdef", "Bearer");
    await vault.getKey("openai");

    const auditFile = path.join(dir, "audit.jsonl");
    const lines = fs.readFileSync(auditFile, "utf8").split("\n").filter(Boolean);
    const getEvents = lines
      .map((l) => JSON.parse(l))
      .filter((e) => e.action === "get_key" && e.provider === "openai");
    assert.ok(getEvents.length >= 1);
    assert.equal(getEvents[0].success, true);
  });

  it("removeKey produces an audit event", async () => {
    const vault = createVault({ vaultDir: dir, encryptionKey: "pw", audit: true });
    await vault.setKey("openai", "sk-test-key-1234567890abcdef", "Bearer");
    await vault.removeKey("openai");

    const auditFile = path.join(dir, "audit.jsonl");
    const lines = fs.readFileSync(auditFile, "utf8").split("\n").filter(Boolean);
    const removeEvents = lines
      .map((l) => JSON.parse(l))
      .filter((e) => e.action === "remove_key" && e.provider === "openai");
    assert.ok(removeEvents.length >= 1);
    assert.equal(removeEvents[0].success, true);
  });

  it("audit=false produces no audit file", async () => {
    const vault = createVault({ vaultDir: dir, encryptionKey: "pw", audit: false });
    await vault.setKey("openai", "sk-test-key-1234567890abcdef", "Bearer");

    const auditFile = path.join(dir, "audit.jsonl");
    assert.ok(!fs.existsSync(auditFile));
  });

  it("failed getKey (missing key) still produces audit event", async () => {
    const vault = createVault({ vaultDir: dir, encryptionKey: "pw", audit: true });
    const result = await vault.getKey("nonexistent");

    assert.equal(result, null);
    const auditFile = path.join(dir, "audit.jsonl");
    const lines = fs.readFileSync(auditFile, "utf8").split("\n").filter(Boolean);
    const events = lines
      .map((l) => JSON.parse(l))
      .filter((e) => e.action === "get_key" && e.provider === "nonexistent");
    assert.ok(events.length >= 1);
  });
});

describe("Vault with TTL (key expiration)", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("setKey with ttl sets expires_at", async () => {
    const vault = createVault({ vaultDir: dir, encryptionKey: "pw" });
    await vault.setKey(
      "openai",
      "sk-test-key-1234567890abcdef",
      "Bearer",
      3600 // 1 hour
    );

    const raw = fs.readFileSync(path.join(dir, "vault.json"), "utf8");
    const parsed = JSON.parse(raw);
    assert.ok(parsed.entries.openai.expires_at);
    const expiresAt = new Date(parsed.entries.openai.expires_at);
    const now = new Date();
    // Should expire at least 30 minutes from now
    assert.ok(expiresAt.getTime() > now.getTime() + 30 * 60 * 1000);
  });

  it("getKey returns key before TTL expires", async () => {
    const vault = createVault({ vaultDir: dir, encryptionKey: "pw" });
    await vault.setKey(
      "openai",
      "sk-test-key-1234567890abcdef",
      "Bearer",
      3600
    );

    const key = await vault.getKey("openai");
    assert.equal(key, "sk-test-key-1234567890abcdef");
  });

  it("getKey returns null for expired key", async () => {
    const vault = createVault({ vaultDir: dir, encryptionKey: "pw" });

    // Manually create an entry with a past expires_at
    const pastDate = new Date(Date.now() - 1000).toISOString();
    const vault2 = createVault({ vaultDir: dir, encryptionKey: "pw" });
    // Use setKey with a very short TTL, then simulate expiry by directly
    // writing to the vault file
    const dir2 = makeTmpDir();
    try {
      const filePath = path.join(dir2, "vault.json");
      const expiredData = {
        salt: "0".repeat(32),
        entries: {
          openai: {
            provider: "openai",
            encrypted_key: "a".repeat(64),
            auth_type: "Bearer",
            created_at: pastDate,
            updated_at: pastDate,
            expires_at: pastDate,
          },
        },
      };
      fs.writeFileSync(filePath, JSON.stringify(expiredData), "utf8");

      const vault3 = createVault({ vaultDir: dir2, encryptionKey: "pw" });
      const key = await vault3.getKey("openai");
      assert.equal(key, null);
    } finally {
      fs.rmSync(dir2, { recursive: true, force: true });
    }
  });

  it("setKey without ttl does not set expires_at", async () => {
    const vault = createVault({ vaultDir: dir, encryptionKey: "pw" });
    await vault.setKey("openai", "sk-test-key-1234567890abcdef", "Bearer");

    const raw = fs.readFileSync(path.join(dir, "vault.json"), "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.entries.openai.expires_at, undefined);
  });

  it("setKey with ttl=0 does not set expires_at", async () => {
    const vault = createVault({ vaultDir: dir, encryptionKey: "pw" });
    await vault.setKey("openai", "sk-test-key-1234567890abcdef", "Bearer", 0);

    const raw = fs.readFileSync(path.join(dir, "vault.json"), "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.entries.openai.expires_at, undefined);
  });

  it("verifyKey returns false for expired key", async () => {
    const dir2 = makeTmpDir();
    try {
      const pastDate = new Date(Date.now() - 1000).toISOString();
      const filePath = path.join(dir2, "vault.json");
      const expiredData = {
        salt: "0".repeat(32),
        entries: {
          openai: {
            provider: "openai",
            encrypted_key: "a".repeat(64),
            auth_type: "Bearer",
            created_at: pastDate,
            updated_at: pastDate,
            expires_at: pastDate,
          },
        },
      };
      fs.writeFileSync(filePath, JSON.stringify(expiredData), "utf8");

      const vault = createVault({ vaultDir: dir2, encryptionKey: "pw" });
      const valid = await vault.verifyKey("openai");
      assert.equal(valid, false);
    } finally {
      fs.rmSync(dir2, { recursive: true, force: true });
    }
  });
});
