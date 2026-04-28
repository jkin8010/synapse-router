// ---------------------------------------------------------------------------
// Public re-exports
// ---------------------------------------------------------------------------
export { deriveKey, encrypt, decrypt } from "./crypto.js";
export type {
  VaultConfig,
  VaultEntry,
  Vault,
  AuditEvent,
  AuditLogger,
  AuditAction,
  KeychainProvider,
} from "./types.js";
export {
  FileAuditLogger,
  NoopAuditLogger,
} from "./audit.js";
export {
  MacOSKeychain,
  LinuxKeychain,
  NoKeychain,
  getKeychainProvider,
  KEYCHAIN_SERVICE,
  KEYCHAIN_ACCOUNT,
} from "./keychain.js";
// NOTE: createVault, getMachineId, and getMachineIdAsync are exported directly below
// as named function exports — do NOT add a re-export here (circular!)

// ---------------------------------------------------------------------------
// Internal re-exports
// ---------------------------------------------------------------------------
import { deriveKey, encrypt, decrypt } from "./crypto.js";
import { acquireLock } from "./lock.js";
import { readVaultDataAsync, writeVaultDataAtomic } from "./persistence.js";
import { FileAuditLogger, NoopAuditLogger } from "./audit.js";
import { getKeychainProvider, KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT } from "./keychain.js";
import { execFileAsync } from "./utils.js";
import type {
  VaultConfig,
  VaultEntry,
  Vault,
  AuditLogger,
} from "./types.js";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Key format validation (provider-specific heuristics)
// ---------------------------------------------------------------------------

const PROVIDER_PATTERNS: Record<string, RegExp> = {
  openai: /^sk-[A-Za-z0-9_-]{20,}$/,
  replicate: /^r8_[A-Za-z0-9]{20,}$/,
  anthropic: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
  google: /^AIza[A-Za-z0-9_-]{30,}$/,
};

function isValidKeyFormat(provider: string, key: string): boolean {
  const pattern = PROVIDER_PATTERNS[provider.toLowerCase()];
  if (pattern) return pattern.test(key);
  return /^\S{20,}$/.test(key);
}

// ---------------------------------------------------------------------------
// Default password helpers
// ---------------------------------------------------------------------------

/**
 * Get machine-specific identifier (async).
 */
export async function getMachineIdAsync(): Promise<string | null> {
  try {
    if (process.platform === "darwin") {
      const { stdout } = await execFileAsync(
        "ioreg",
        ["-rd1", "-c", "IOPlatformExpertDevice"],
        { timeout: 5000 }
      );
      const match = stdout.split('"');
      if (match.length >= 4) return match[3].trim();
    } else if (process.platform === "linux") {
      const { readFileSync } = await import("node:fs");
      return readFileSync("/etc/machine-id", "utf8").trim();
    }
  } catch {
    // machine-id unavailable
  }
  return null;
}

/** Synchronous version kept for backwards compatibility / tests */
export function getMachineId(): string | null {
  // eslint-disable-next-line no-sync-functions-in-async-functions
  const { execSync } = require("node:child_process");
  // eslint-disable-next-line no-sync-functions-in-async-functions
  const { readFileSync } = require("node:fs");
  try {
    if (process.platform === "darwin") {
      const output = execSync(
        "ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID",
        { encoding: "utf8", timeout: 5000 }
      );
      const match = output.split('"');
      if (match.length >= 4) return match[3].trim();
    } else if (process.platform === "linux") {
      return readFileSync("/etc/machine-id", "utf8").trim();
    }
  } catch {
    // machine-id unavailable
  }
  return null;
}

async function getDefaultPasswordAsync(): Promise<string> {
  const machineId = await getMachineIdAsync();
  if (machineId) {
    return `${os.hostname()}:${os.userInfo().username}:${machineId}`;
  }
  console.warn(
    "[vault] WARNING: Could not read machine-id. Falling back to hostname+username default password, which is less secure."
  );
  return `${os.hostname()}:${os.userInfo().username}`;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface VaultData {
  salt: string;
  entries: Record<string, VaultEntry>;
}

// ---------------------------------------------------------------------------
// createVault — lazy async init
// ---------------------------------------------------------------------------

export function createVault(config?: Partial<VaultConfig>): Vault {
  const vaultDir =
    config?.vaultDir ?? path.join(os.homedir(), ".synapse", "keys");
  const passwordPromise = config?.encryptionKey
    ? Promise.resolve(config.encryptionKey)
    : getDefaultPasswordAsync();

  // Generate unique instance ID for instance-specific lock file
  const instanceId =
    config?.instanceId ??
    `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Audit logger
  let audit: AuditLogger;
  if (config?.audit === false) {
    audit = new NoopAuditLogger();
  } else if (config?.audit === true || config?.audit === undefined) {
    audit = new FileAuditLogger(vaultDir);
  } else {
    audit = config.audit as AuditLogger;
  }

  let derivedKey: string | null = null;
  let salt: string | null = null;
  let initialized = false;
  let initError: Error | null = null;

  async function ensureInitialized(): Promise<void> {
    if (initialized) {
      if (initError) throw initError;
      return;
    }
    try {
      const preferKeychain = config?.preferKeychain ?? true;

      // Try OS Keychain first (stores the derived encryption key)
      if (preferKeychain) {
        try {
          const kc = await getKeychainProvider();
          if (await kc.isAvailable()) {
            const storedKey = await kc.get(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
            if (storedKey) {
              derivedKey = storedKey;
            }
          }
        } catch {
          // Keychain unavailable or error — fall back to password derivation
        }
      }

      const password = await passwordPromise;
      const machineId: string | undefined = (await getMachineIdAsync()) ?? undefined;

      // ALWAYS read existing vault data first to get the canonical salt.
      // This is critical for concurrent initialization: if vault.json already
      // exists (created by another instance), we must use its salt — not generate
      // a new one.  Two instances using different salts = different keys =
      // ciphertext that only the original writer can decrypt.
      const existing = await readVaultDataAsync(vaultDir);
      if (existing) {
        salt = existing.salt;
        if (!derivedKey) {
          ({ key: derivedKey } = deriveKey(password, salt, machineId));
        }
      } else {
        // vault.json does not exist yet.  We are the first writer.
        // deriveKey with undefined salt generates a random salt internally —
        // use that returned salt so derivedKey and vault.json.salt are always consistent.
        ({ key: derivedKey, salt } = deriveKey(password, undefined, machineId));
        // Store new derived key in OS Keychain for future use
        if (preferKeychain) {
          try {
            const kc = await getKeychainProvider();
            if (await kc.isAvailable()) {
              await kc.set(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, derivedKey);
            }
          } catch {
            // Keychain store failed — not fatal, continue with derived key
          }
        }
      }

      initialized = true;
    } catch (err) {
      initError = err as Error;
      throw err;
    }
  }

  async function loadData(): Promise<VaultData> {
    await ensureInitialized();
    const d = await readVaultDataAsync(vaultDir);
    if (d) return d;
    return { salt: salt!, entries: {} };
  }

  async function persist(data: VaultData): Promise<void> {
    await ensureInitialized();
    const unlock = await acquireLock(vaultDir, instanceId);
    try {
      audit.log({ action: "lock_acquired", success: true });
      const current = await readVaultDataAsync(vaultDir);
      const merged: VaultData = current
        ? { ...data, salt: data.salt ?? current.salt }
        : { ...data, salt: data.salt ?? salt! };
      await writeVaultDataAtomic(vaultDir, merged);
    } finally {
      await unlock();
      try {
        audit.log({ action: "lock_released", success: true });
      } catch {
        // best-effort
      }
    }
  }

  return {
    async setKey(
      provider: string,
      key: string,
      authType: "Bearer" | "APIKey" | "OAuth2",
      ttl?: number
    ): Promise<void> {
      try {
        await ensureInitialized();
        const data = await loadData();
        const now = new Date().toISOString();
        const encrypted = encrypt(key, derivedKey!);

        const existing = data.entries[provider];
        const entry: VaultEntry = {
          provider,
          encrypted_key: encrypted,
          auth_type: authType,
          created_at: existing?.created_at ?? now,
          updated_at: now,
          last_verified_at: existing?.last_verified_at,
        };

        if (ttl !== undefined && ttl > 0) {
          entry.expires_at = new Date(Date.now() + ttl * 1000).toISOString();
        }

        data.entries[provider] = entry;
        data.salt = data.salt ?? salt!;
        await persist(data);
        audit.log({ action: "set_key", provider, success: true });
      } catch (err) {
        audit.log({
          action: "set_key",
          provider,
          success: false,
          error: String(err),
        });
        throw err;
      }
    },

    async getKey(provider: string): Promise<string | null> {
      try {
        await ensureInitialized();
        const data = await loadData();
        const entry = data.entries[provider];
        if (!entry) {
          audit.log({ action: "get_key", provider, success: true });
          return null;
        }

        if (entry.expires_at && new Date(entry.expires_at) < new Date()) {
          audit.log({
            action: "get_key",
            provider,
            success: false,
            error: "key_expired",
          });
          return null;
        }

        try {
          const plain = decrypt(entry.encrypted_key, derivedKey!);
          audit.log({ action: "get_key", provider, success: true });
          return plain;
        } catch {
          audit.log({
            action: "get_key",
            provider,
            success: false,
            error: "decrypt_failed",
          });
          return null;
        }
      } catch (err) {
        audit.log({
          action: "get_key",
          provider,
          success: false,
          error: String(err),
        });
        throw err;
      }
    },

    async removeKey(provider: string): Promise<boolean> {
      try {
        await ensureInitialized();
        const data = await loadData();
        if (!(provider in data.entries)) {
          audit.log({ action: "remove_key", provider, success: true });
          return false;
        }
        delete data.entries[provider];
        await persist(data);
        audit.log({ action: "remove_key", provider, success: true });
        return true;
      } catch (err) {
        audit.log({
          action: "remove_key",
          provider,
          success: false,
          error: String(err),
        });
        throw err;
      }
    },

    async listKeys(): Promise<string[]> {
      try {
        await ensureInitialized();
        const data = await loadData();
        audit.log({ action: "list_keys", success: true });
        return Object.keys(data.entries);
      } catch (err) {
        audit.log({ action: "list_keys", success: false, error: String(err) });
        throw err;
      }
    },

    async hasKey(provider: string): Promise<boolean> {
      await ensureInitialized();
      const data = await loadData();
      return provider in data.entries;
    },

    async verifyKey(provider: string): Promise<boolean> {
      try {
        await ensureInitialized();
        const data = await loadData();
        const entry = data.entries[provider];
        if (!entry) {
          audit.log({ action: "verify_key", provider, success: false });
          return false;
        }

        if (entry.expires_at && new Date(entry.expires_at) < new Date()) {
          audit.log({
            action: "verify_key",
            provider,
            success: false,
            error: "key_expired",
          });
          return false;
        }

        let plainKey: string;
        try {
          plainKey = decrypt(entry.encrypted_key, derivedKey!);
        } catch {
          audit.log({
            action: "verify_key",
            provider,
            success: false,
            error: "decrypt_failed",
          });
          return false;
        }

        const valid = isValidKeyFormat(provider, plainKey);
        audit.log({
          action: "verify_key",
          provider,
          success: true,
          error: valid ? undefined : "invalid_format",
        });
        return valid;
      } catch (err) {
        audit.log({
          action: "verify_key",
          provider,
          success: false,
          error: String(err),
        });
        throw err;
      }
    },

    async rotateKey(newPassword: string): Promise<void> {
      try {
        await ensureInitialized();
        const data = await loadData();
        const entries = data.entries;

        const plainKeys: Array<{
          provider: string;
          key: string;
          entry: VaultEntry;
        }> = [];
        for (const [provider, entry] of Object.entries(entries)) {
          try {
            const plain = decrypt(entry.encrypted_key, derivedKey!);
            plainKeys.push({ provider, key: plain, entry });
          } catch {
            throw new Error(
              `Cannot decrypt key for provider "${provider}" during rotation. Wrong current password?`
            );
          }
        }

        const newMachineId = (await getMachineIdAsync()) ?? undefined;
        const { key: newDerivedKey, salt: newSalt } = deriveKey(
          newPassword,
          undefined,
          newMachineId
        );

        const newEntries: Record<string, VaultEntry> = {};
        const now = new Date().toISOString();
        for (const { provider, key, entry } of plainKeys) {
          newEntries[provider] = {
            ...entry,
            encrypted_key: encrypt(key, newDerivedKey),
            updated_at: now,
          };
        }

        const newData: VaultData = { salt: newSalt, entries: newEntries };
        const unlock = await acquireLock(vaultDir, instanceId);
        try {
          await writeVaultDataAtomic(vaultDir, newData);
        } finally {
          await unlock();
        }

        derivedKey = newDerivedKey;
        salt = newSalt;

        if (config?.preferKeychain ?? true) {
          try {
            const kc = await getKeychainProvider();
            if (await kc.isAvailable()) {
              await kc.set(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, newDerivedKey);
            }
          } catch {
            // Keychain update failed — not fatal
          }
        }

        audit.log({ action: "rotate_key", success: true });
      } catch (err) {
        audit.log({
          action: "rotate_key",
          success: false,
          error: String(err),
        });
        throw err;
      }
    },
  };
}
