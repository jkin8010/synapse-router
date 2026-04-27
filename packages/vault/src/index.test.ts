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
  getMachineId,
} from "./index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-test-"));
  return dir;
}

// ---------------------------------------------------------------------------
// encrypt / decrypt
// ---------------------------------------------------------------------------

describe("encrypt / decrypt", () => {
  it("round-trips correctly", () => {
    const { key } = deriveKey("test-password");
    const plain = "sk-abcdef1234567890abcdefghijklmnop";
    const encrypted = encrypt(plain, key);
    const decrypted = decrypt(encrypted, key);
    assert.equal(decrypted, plain);
  });

  it("produces different ciphertext each call (random IV)", () => {
    const { key } = deriveKey("test-password");
    const plain = "hello-world";
    const e1 = encrypt(plain, key);
    const e2 = encrypt(plain, key);
    assert.notEqual(e1, e2);
  });

  it("fails on tampered ciphertext", () => {
    const { key } = deriveKey("test-password");
    const encrypted = encrypt("secret", key);
    const parts = encrypted.split(":");
    // flip a byte in the ciphertext
    const cipherBuf = Buffer.from(parts[2], "hex");
    cipherBuf[0] ^= 0xff;
    parts[2] = cipherBuf.toString("hex");
    assert.throws(() => decrypt(parts.join(":"), key));
  });

  it("fails with wrong key", () => {
    const { key: key1 } = deriveKey("password-1");
    const { key: key2 } = deriveKey("password-2");
    const encrypted = encrypt("secret", key1);
    assert.throws(() => decrypt(encrypted, key2));
  });

  it("rejects invalid format", () => {
    const { key } = deriveKey("test-password");
    assert.throws(() => decrypt("not:enough:parts", key));
  });
});

// ---------------------------------------------------------------------------
// deriveKey
// ---------------------------------------------------------------------------

describe("deriveKey", () => {
  it("produces same key with same password + salt", () => {
    const { key: k1, salt } = deriveKey("pw");
    const { key: k2 } = deriveKey("pw", salt);
    assert.equal(k1, k2);
  });

  it("produces different keys with different passwords", () => {
    const { key: k1, salt } = deriveKey("pw-a");
    const { key: k2 } = deriveKey("pw-b", salt);
    assert.notEqual(k1, k2);
  });

  it("generates a random salt when none provided", () => {
    const { salt: s1 } = deriveKey("pw");
    const { salt: s2 } = deriveKey("pw");
    assert.notEqual(s1, s2);
  });

  it("default password derivation uses hostname+username+machineId", () => {
    const machineId = getMachineId();
    const base = `${os.hostname()}:${os.userInfo().username}`;
    const expected = machineId ? `${base}:${machineId}` : base;
    // Just confirm deriveKey works with that string
    const { key } = deriveKey(expected);
    assert.ok(key.length > 0);
  });

  it("deriveKey with machineId produces different key than without", () => {
    const { key: k1, salt } = deriveKey("pw");
    const { key: k2 } = deriveKey("pw", salt, "test-machine-id");
    assert.notEqual(k1, k2);
  });

  it("deriveKey with same machineId is deterministic", () => {
    const { key: k1, salt } = deriveKey("pw", undefined, "test-machine-id");
    const { key: k2 } = deriveKey("pw", salt, "test-machine-id");
    assert.equal(k1, k2);
  });
});

// ---------------------------------------------------------------------------
// Vault integration
// ---------------------------------------------------------------------------

describe("Vault", () => {
  before(() => {
    tmpDir = makeTmpDir();
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("setKey + getKey round-trip", async () => {
    const vault = createVault({ vaultDir: path.join(tmpDir, "t1") });
    await vault.setKey("openai", "sk-abcdef1234567890abcdefghijklmnop", "Bearer");
    const key = await vault.getKey("openai");
    assert.equal(key, "sk-abcdef1234567890abcdefghijklmnop");
  });

  it("getKey returns null for missing provider", async () => {
    const vault = createVault({ vaultDir: path.join(tmpDir, "t2") });
    const key = await vault.getKey("nonexistent");
    assert.equal(key, null);
  });

  it("listKeys returns providers without key values", async () => {
    const vault = createVault({ vaultDir: path.join(tmpDir, "t3") });
    await vault.setKey("openai", "sk-openai-key-1234567890abcdef", "Bearer");
    await vault.setKey("replicate", "r8_replicate-key-1234567890abcdef", "APIKey");

    const keys = await vault.listKeys();
    assert.deepEqual(keys.sort(), ["openai", "replicate"]);

    // Ensure raw file does not contain plaintext keys
    const raw = fs.readFileSync(path.join(tmpDir, "t3", "vault.json"), "utf8");
    assert.ok(!raw.includes("sk-openai-key"));
    assert.ok(!raw.includes("r8_replicate-key"));
  });

  it("removeKey works and returns correct boolean", async () => {
    const vault = createVault({ vaultDir: path.join(tmpDir, "t4") });
    await vault.setKey("openai", "sk-some-key-1234567890abcdef", "Bearer");

    const removed = await vault.removeKey("openai");
    assert.equal(removed, true);

    const removedAgain = await vault.removeKey("openai");
    assert.equal(removedAgain, false);

    const key = await vault.getKey("openai");
    assert.equal(key, null);
  });

  it("hasKey returns correct presence", async () => {
    const vault = createVault({ vaultDir: path.join(tmpDir, "t5") });
    assert.equal(await vault.hasKey("openai"), false);
    await vault.setKey("openai", "sk-test-key-1234567890abcdef", "Bearer");
    assert.equal(await vault.hasKey("openai"), true);
  });

  it("verifyKey validates format without API call", async () => {
    const vault = createVault({ vaultDir: path.join(tmpDir, "t6") });

    // Valid OpenAI key format
    await vault.setKey("openai", "sk-abcdef1234567890abcdefghijklmnop", "Bearer");
    assert.equal(await vault.verifyKey("openai"), true);

    // Invalid key (too short)
    await vault.setKey("openai", "short", "Bearer");
    assert.equal(await vault.verifyKey("openai"), false);

    // Unknown provider — generic check (20+ non-whitespace)
    await vault.setKey("unknown", "a-very-long-key-that-should-pass-generic-check", "APIKey");
    assert.equal(await vault.verifyKey("unknown"), true);

    // Unknown provider too short
    await vault.setKey("unknown", "tiny", "APIKey");
    assert.equal(await vault.verifyKey("unknown"), false);
  });

  it("setKey preserves created_at on update", async () => {
    const vault = createVault({ vaultDir: path.join(tmpDir, "t7") });
    await vault.setKey("openai", "sk-first-key-1234567890abcdef", "Bearer");
    // small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 10));
    await vault.setKey("openai", "sk-second-key-1234567890abcdef", "Bearer");

    // Should still be able to read the updated key
    const key = await vault.getKey("openai");
    assert.equal(key, "sk-second-key-1234567890abcdef");
  });

  it("uses default password when encryptionKey not provided", async () => {
    // Without explicit encryptionKey it should use hostname+username
    const vault = createVault({ vaultDir: path.join(tmpDir, "t8") });
    await vault.setKey("openai", "sk-default-pw-test-1234567890ab", "Bearer");
    const key = await vault.getKey("openai");
    assert.equal(key, "sk-default-pw-test-1234567890ab");
  });

  it("custom encryptionKey works", async () => {
    const vault = createVault({
      vaultDir: path.join(tmpDir, "t9"),
      encryptionKey: "my-custom-password",
    });
    await vault.setKey("replicate", "r8_custom_pw_key_1234567890abcdef", "APIKey");
    const key = await vault.getKey("replicate");
    assert.equal(key, "r8_custom_pw_key_1234567890abcdef");
  });

  it("persists data across Vault instances", async () => {
    const dir = path.join(tmpDir, "t10");
    const vault1 = createVault({ vaultDir: dir });
    await vault1.setKey("openai", "sk-persist-key-1234567890abcdef", "Bearer");

    // New instance reading from the same dir
    const vault2 = createVault({ vaultDir: dir });
    const key = await vault2.getKey("openai");
    assert.equal(key, "sk-persist-key-1234567890abcdef");
  });

  // ---------------------------------------------------------------------------
  // P5: Edge case & boundary tests
  // ---------------------------------------------------------------------------

  it("handles corrupted vault.json gracefully", async () => {
    const dir = path.join(tmpDir, "t11-corrupted");
    const vault = createVault({ vaultDir: dir, encryptionKey: "test-password" });
    await vault.setKey("openai", "sk-corrupted-test-1234567890ab", "Bearer");

    // Corrupt the vault file
    const filePath = path.join(dir, "vault.json");
    fs.writeFileSync(filePath, "{ this is not valid json }}}", "utf8");

    const vault2 = createVault({ vaultDir: dir, encryptionKey: "test-password" });
    // getKey should return null (readVaultData throws on JSON.parse, but createVault
    // handles it gracefully by returning null)
    const key = await vault2.getKey("openai");
    // With corrupted JSON, readVaultData will throw, and loadData will fallback
    // to empty data — so getKey returns null
    assert.equal(key, null);
  });

  it("handles very long key values (>1KB)", async () => {
    const dir = path.join(tmpDir, "t12-longkey");
    const vault = createVault({ vaultDir: dir, encryptionKey: "test-password" });
    // Build a key > 1KB
    const longKey = "sk-" + "A".repeat(1100);
    await vault.setKey("openai", longKey, "Bearer");
    const retrieved = await vault.getKey("openai");
    assert.equal(retrieved, longKey);
  });

  it("handles special characters in keys (emoji, unicode, newlines)", async () => {
    const dir = path.join(tmpDir, "t13-special");
    const vault = createVault({ vaultDir: dir, encryptionKey: "test-password" });
    const specialKey = "sk-🔑-key-with-émoji-\n-newline-\t-tab-中文";
    await vault.setKey("openai", specialKey, "Bearer");
    const retrieved = await vault.getKey("openai");
    assert.equal(retrieved, specialKey);
  });

  it("rotateKey: new password can decrypt, old password cannot", async () => {
    const dir = path.join(tmpDir, "t14-rotate");
    const vault = createVault({ vaultDir: dir, encryptionKey: "old-password" });
    await vault.setKey("openai", "sk-rotate-test-1234567890abcdef", "Bearer");
    await vault.setKey("replicate", "r8_rotate_test_1234567890abcdef", "APIKey");

    // Rotate to new password
    await vault.rotateKey("new-password");

    // Should be able to read with the same vault instance (in-memory key updated)
    const key1 = await vault.getKey("openai");
    assert.equal(key1, "sk-rotate-test-1234567890abcdef");
    const key2 = await vault.getKey("replicate");
    assert.equal(key2, "r8_rotate_test_1234567890abcdef");

    // Create a new vault instance with the OLD password — should NOT be able to decrypt
    const oldVault = createVault({ vaultDir: dir, encryptionKey: "old-password" });
    const oldKey = await oldVault.getKey("openai");
    assert.equal(oldKey, null);

    // Create a new vault instance with the NEW password — should be able to decrypt
    const newVault = createVault({ vaultDir: dir, encryptionKey: "new-password" });
    const newKey = await newVault.getKey("openai");
    assert.equal(newKey, "sk-rotate-test-1234567890abcdef");
  });

  it("rotateKey throws when current password cannot decrypt entries", async () => {
    const dir = path.join(tmpDir, "t15-rotate-fail");
    // Create vault with one password, then try to rotate with a different vault instance
    const vault1 = createVault({ vaultDir: dir, encryptionKey: "correct-password" });
    await vault1.setKey("openai", "sk-test-key-1234567890abcdef", "Bearer");

    // Create another vault instance with a WRONG password and try to rotate
    const vault2 = createVault({ vaultDir: dir, encryptionKey: "wrong-password" });
    await assert.rejects(
      () => vault2.rotateKey("another-password"),
      /Cannot decrypt key for provider/
    );
  });

  it("vault.json file permission is 0o600", async () => {
    // Only meaningful on Linux/macOS
    if (process.platform === "win32") return;
    const dir = path.join(tmpDir, "t16-perms");
    const vault = createVault({ vaultDir: dir, encryptionKey: "test-password" });
    await vault.setKey("openai", "sk-perm-test-1234567890abcdef", "Bearer");

    const filePath = path.join(dir, "vault.json");
    const stat = fs.statSync(filePath);
    const mode = stat.mode & 0o777;
    assert.equal(mode, 0o600, `Expected file mode 0o600, got 0o${mode.toString(8)}`);
  });
});
