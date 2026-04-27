/**
 * Additional Vault Security Tests
 * Focus on security-specific edge cases beyond existing tests
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  encrypt,
  decrypt,
  deriveKey,
  createVault,
} from "./index.js";

let tmpDir: string;

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vault-sec-test-"));
}

describe("Vault security: encrypt/decrypt roundtrip consistency", () => {
  it("round-trips special characters and unicode", () => {
    const { key } = deriveKey("sec-test-password");
    const special = "sk-!@#$%^&*()_+-=[]{}|;':\",./<>?中文🔑";
    const encrypted = encrypt(special, key);
    const decrypted = decrypt(encrypted, key);
    assert.equal(decrypted, special);
  });

  it("round-trips very long keys (256 chars)", () => {
    const { key } = deriveKey("sec-test-password");
    const long = "sk-" + "a".repeat(252);
    const encrypted = encrypt(long, key);
    const decrypted = decrypt(encrypted, key);
    assert.equal(decrypted, long);
  });

  it("round-trips empty string", () => {
    const { key } = deriveKey("sec-test-password");
    const empty = "";
    const encrypted = encrypt(empty, key);
    const decrypted = decrypt(encrypted, key);
    assert.equal(decrypted, empty);
  });
});

describe("Vault security: wrong password decryption fails", () => {
  it("different password with same salt fails", () => {
    const { key: key1, salt } = deriveKey("correct-password");
    const { key: key2 } = deriveKey("wrong-password", salt);
    const encrypted = encrypt("super-secret-key", key1);
    assert.throws(() => decrypt(encrypted, key2));
  });

  it("decryption with completely wrong key fails", () => {
    const { key: correctKey } = deriveKey("my-password");
    const { key: wrongKey } = deriveKey("totally-different");
    const encrypted = encrypt("secret-value", correctKey);
    assert.throws(() => decrypt(encrypted, wrongKey));
  });
});

describe("Vault security: vault.json does not contain plaintext keys", () => {
  before(() => {
    tmpDir = makeTmpDir();
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("multiple keys stored - none appear in plaintext", async () => {
    const vault = createVault({ vaultDir: path.join(tmpDir, "sec1") });
    const sensitiveKeys = [
      "sk-super-secret-openai-key-1234567890",
      "r8_replicate-secret-key-abcdefghij",
      "xai-grok-secret-api-key-zyxwvutsrq",
    ];
    await vault.setKey("openai", sensitiveKeys[0], "Bearer");
    await vault.setKey("replicate", sensitiveKeys[1], "APIKey");
    await vault.setKey("xai", sensitiveKeys[2], "Bearer");

    const raw = fs.readFileSync(path.join(tmpDir, "sec1", "vault.json"), "utf8");
    for (const key of sensitiveKeys) {
      assert.ok(!raw.includes(key), `vault.json should NOT contain plaintext key: ${key.substring(0, 10)}...`);
    }
  });

  it("vault.json structure contains encrypted_key, not key values", async () => {
    const vault = createVault({ vaultDir: path.join(tmpDir, "sec2") });
    await vault.setKey("test", "sk-my-secret-key-value-1234567890", "Bearer");

    const raw = fs.readFileSync(path.join(tmpDir, "sec2", "vault.json"), "utf8");
    const parsed = JSON.parse(raw);

    // Should have encrypted entries, not plaintext
    assert.ok(parsed.entries, "vault.json should have entries field");
    assert.ok(parsed.entries.test, "Should have test provider entry");
    assert.ok(parsed.entries.test.encrypted_key, "Should have encrypted_key field");
    assert.ok(!parsed.entries.test.encrypted_key.includes("sk-my-secret"), "encrypted_key should not contain plaintext");
    // Verify salt exists and entries have proper structure
    assert.ok(parsed.salt, "vault.json should have salt field");
    assert.equal(parsed.entries.test.auth_type, "Bearer");
  });
});

describe("Vault security: listKeys does not return key values", () => {
  before(() => {
    tmpDir = makeTmpDir();
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("listKeys returns only provider names (strings), never key objects or values", async () => {
    const vault = createVault({ vaultDir: path.join(tmpDir, "sec3") });
    await vault.setKey("openai", "sk-very-secret-openai-key-1234567890", "Bearer");
    await vault.setKey("anthropic", "sk-ant-very-secret-key-1234567890", "Bearer");

    const keys = await vault.listKeys();
    // listKeys should return string[], not objects with key values
    for (const k of keys) {
      assert.equal(typeof k, "string", "listKeys should return strings only");
      assert.ok(!k.includes("sk-"), "listKeys item should not contain key values");
    }
    assert.deepEqual(keys.sort(), ["anthropic", "openai"]);
  });
});
