import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";

// ---------------------------------------------------------------------------
// Crypto constants
// ---------------------------------------------------------------------------

export const PBKDF2_ITERATIONS = 600_000;
export const KEY_LENGTH = 32;             // 256 bits for AES-256
export const SALT_LENGTH = 16;            // 128 bits salt (32 hex chars)
export const IV_LENGTH = 12;             // 96 bits recommended for GCM
export const AUTH_TAG_LENGTH = 16;

/**
 * Derive an AES-256 key from a password using PBKDF2.
 * If salt is not provided a random one is generated.
 *
 * The machineId parameter only affects key derivation for NEW vaults; when
 * reading existing vaults with a stored salt, machineId does NOT affect derivation
 * unless the stored salt already includes a machineId (detected by length === 64 hex chars).
 */
export function deriveKey(password: string, salt?: string, machineId?: string): { key: string; salt: string } {
  if (typeof salt === "string" && salt.length === 64) {
    // Detected a stored salt with machineId appended (64 hex = 32 bytes total)
    // Do NOT use provided machineId; treat salt as is
    const key = pbkdf2Sync(
      password,
      Buffer.from(salt, "hex"),
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      "sha256"
    ).toString("hex");
    return { key, salt };
  } else if (typeof salt === "string" && salt.length === 32) {
    // Standard 32 character hex salt → ignore provided machineId completely
    const key = pbkdf2Sync(
      password,
      Buffer.from(salt, "hex"),
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      "sha256"
    ).toString("hex");
    return { key, salt };
  }

  // No salt provided → generate new salt + optional machineId
  const actualSalt = randomBytes(SALT_LENGTH).toString("hex");
  let effectiveSalt = actualSalt;
  if (machineId) {
    const machineIdHex = pbkdf2Sync(machineId, "synapse-vault-machineid", 1, SALT_LENGTH, "sha256").toString("hex");
    effectiveSalt = actualSalt + machineIdHex; // total of 64 hex chars (32 bytes)
  }

  const key = pbkdf2Sync(
    password,
    Buffer.from(effectiveSalt, "hex"),
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    "sha256"
  ).toString("hex");

  return { key, salt: machineId ? effectiveSalt : actualSalt };
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
