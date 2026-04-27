import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VaultConfig {
  vaultDir: string;        // 存储目录路径，默认 ~/.synapse/keys/
  encryptionKey?: string;  // 用户密码派生的加密密钥
}

export interface VaultEntry {
  provider: string;
  encrypted_key: string;
  auth_type: "Bearer" | "APIKey" | "OAuth2";
  created_at: string;
  updated_at: string;
  last_verified_at?: string;
}

interface VaultData {
  salt: string;
  entries: Record<string, VaultEntry>;  // keyed by provider
}

export interface Vault {
  setKey(provider: string, key: string, authType: "Bearer" | "APIKey" | "OAuth2"): Promise<void>;
  getKey(provider: string): Promise<string | null>;
  removeKey(provider: string): Promise<boolean>;
  listKeys(): Promise<string[]>;
  hasKey(provider: string): Promise<boolean>;
  verifyKey(provider: string): Promise<boolean>;
  rotateKey(newPassword: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 600_000;
const KEY_LENGTH = 32;             // 256 bits for AES-256
const SALT_LENGTH = 16;
const IV_LENGTH = 12;             // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Derive an AES-256 key from a password using PBKDF2.
 * If salt is not provided a random one is generated.
 */
export function deriveKey(password: string, salt?: string, machineId?: string): { key: string; salt: string } {
  const actualSalt = salt ?? randomBytes(SALT_LENGTH).toString("hex");
  // Incorporate machineId into the salt for additional hardening.
  // machineId is a non-hex string (UUID or machine-id), so we hash it
  // to produce a deterministic hex component that can be safely concatenated.
  let effectiveSalt: string;
  if (machineId) {
    const machineIdHex = pbkdf2Sync(machineId, "synapse-vault-machineid", 1, SALT_LENGTH, "sha256").toString("hex");
    effectiveSalt = actualSalt + machineIdHex;
  } else {
    effectiveSalt = actualSalt;
  }
  const key = pbkdf2Sync(
    password,
    Buffer.from(effectiveSalt, "hex"),
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    "sha256"
  ).toString("hex");
  return { key, salt: actualSalt };
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns a string: `iv:authTag:ciphertext` (all hex-encoded).
 */
export function encrypt(text: string, key: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a value produced by `encrypt`.
 */
export function decrypt(encrypted: string, key: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format — expected iv:authTag:ciphertext");
  }
  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ---------------------------------------------------------------------------
// Default password (machine-specific)
// ---------------------------------------------------------------------------

export function getMachineId(): string | null {
  try {
    if (process.platform === "darwin") {
      // macOS: read IOPlatformUUID
      const output = execSync(
        "ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID",
        { encoding: "utf8", timeout: 5000 }
      );
      const match = output.split('"');
      if (match.length >= 4) return match[3].trim();
    } else if (process.platform === "linux") {
      // Linux: read /etc/machine-id
      return fs.readFileSync("/etc/machine-id", "utf8").trim();
    }
  } catch {
    // machine-id unavailable
  }
  return null;
}

function getDefaultPassword(): string {
  const machineId = getMachineId();
  if (machineId) {
    return `${os.hostname()}:${os.userInfo().username}:${machineId}`;
  }
  console.warn(
    "[vault] WARNING: Could not read machine-id. Falling back to hostname+username default password, which is less secure."
  );
  return `${os.hostname()}:${os.userInfo().username}`;
}

// ---------------------------------------------------------------------------
// Vault persistence
// ---------------------------------------------------------------------------

const VAULT_FILE = "vault.json";

function readVaultData(vaultDir: string): VaultData | null {
  const filePath = path.join(vaultDir, VAULT_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as VaultData;
  } catch {
    // Corrupted or unreadable vault file
    return null;
  }
}

function writeVaultData(vaultDir: string, data: VaultData): void {
  if (!fs.existsSync(vaultDir)) {
    fs.mkdirSync(vaultDir, { recursive: true, mode: 0o700 });
  }
  const filePath = path.join(vaultDir, VAULT_FILE);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
}

// ---------------------------------------------------------------------------
// Key format validation (provider-specific heuristics)
// ---------------------------------------------------------------------------

const PROVIDER_PATTERNS: Record<string, RegExp> = {
  openai: /^sk-[A-Za-z0-9_-]{20,}$/,
  replicate: /^r8_[A-Za-z0-9]{20,}$/,
  anthropic: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
  google: /^AIza[A-Za-z0-9_-]{30,}$/,
};

/**
 * Basic format validation — does NOT call any API.
 * Falls back to "at least 20 printable chars" for unknown providers.
 */
function isValidKeyFormat(provider: string, key: string): boolean {
  const pattern = PROVIDER_PATTERNS[provider.toLowerCase()];
  if (pattern) return pattern.test(key);
  // Generic: at least 20 non-whitespace chars
  return /^\S{20,}$/.test(key);
}

// ---------------------------------------------------------------------------
// createVault
// ---------------------------------------------------------------------------

export function createVault(config?: Partial<VaultConfig>): Vault {
  const vaultDir = config?.vaultDir ?? path.join(os.homedir(), ".synapse", "keys");
  const password = config?.encryptionKey ?? getDefaultPassword();

  // Ensure the encryption key is derived & consistent with what's on disk.
  // If a vault file already exists we reuse its salt; otherwise we derive fresh.
  let derivedKey: string;
  let salt: string;

  const machineId = getMachineId() ?? undefined;

  const existing = readVaultData(vaultDir);
  if (existing) {
    salt = existing.salt;
    ({ key: derivedKey } = deriveKey(password, salt, machineId));
  } else {
    ({ key: derivedKey, salt } = deriveKey(password, undefined, machineId));
  }

  // --- Vault implementation ---

  const loadData = (): VaultData => {
    const d = readVaultData(vaultDir);
    if (d) return d;
    return { salt, entries: {} };
  };

  const persist = (data: VaultData): void => {
    writeVaultData(vaultDir, data);
  };

  return {
    async setKey(provider: string, key: string, authType: "Bearer" | "APIKey" | "OAuth2"): Promise<void> {
      const data = loadData();
      const now = new Date().toISOString();
      const encrypted = encrypt(key, derivedKey);

      const existing = data.entries[provider];
      data.entries[provider] = {
        provider,
        encrypted_key: encrypted,
        auth_type: authType,
        created_at: existing?.created_at ?? now,
        updated_at: now,
        last_verified_at: existing?.last_verified_at,
      };
      // Make sure salt is always persisted
      data.salt = data.salt ?? salt;
      persist(data);
    },

    async getKey(provider: string): Promise<string | null> {
      const data = loadData();
      const entry = data.entries[provider];
      if (!entry) return null;
      try {
        return decrypt(entry.encrypted_key, derivedKey);
      } catch {
        // Decryption failure — likely wrong password / corrupted data
        return null;
      }
    },

    async removeKey(provider: string): Promise<boolean> {
      const data = loadData();
      if (!(provider in data.entries)) return false;
      delete data.entries[provider];
      persist(data);
      return true;
    },

    async listKeys(): Promise<string[]> {
      const data = loadData();
      return Object.keys(data.entries);
    },

    async hasKey(provider: string): Promise<boolean> {
      const data = loadData();
      return provider in data.entries;
    },

    async verifyKey(provider: string): Promise<boolean> {
      const data = loadData();
      const entry = data.entries[provider];
      if (!entry) return false;
      let plainKey: string;
      try {
        plainKey = decrypt(entry.encrypted_key, derivedKey);
      } catch {
        return false;
      }
      return isValidKeyFormat(provider, plainKey);
    },

    async rotateKey(newPassword: string): Promise<void> {
      const data = loadData();
      const entries = data.entries;

      // 1. Decrypt all keys with the old derived key
      const plainKeys: Array<{ provider: string; key: string; entry: VaultEntry }> = [];
      for (const [provider, entry] of Object.entries(entries)) {
        try {
          const plain = decrypt(entry.encrypted_key, derivedKey);
          plainKeys.push({ provider, key: plain, entry });
        } catch {
          throw new Error(`Cannot decrypt key for provider "${provider}" during rotation. Wrong current password?`);
        }
      }

      // 2. Derive new key from new password
      const newMachineId = machineId;
      const { key: newDerivedKey, salt: newSalt } = deriveKey(newPassword, undefined, newMachineId);

      // 3. Re-encrypt all keys with new derived key
      const newEntries: Record<string, VaultEntry> = {};
      const now = new Date().toISOString();
      for (const { provider, key, entry } of plainKeys) {
        newEntries[provider] = {
          ...entry,
          encrypted_key: encrypt(key, newDerivedKey),
          updated_at: now,
        };
      }

      // 4. Write new vault data
      const newData: VaultData = { salt: newSalt, entries: newEntries };
      persist(newData);

      // 5. Update in-memory state
      derivedKey = newDerivedKey;
      salt = newSalt;
    },
  };
}
