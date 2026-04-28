export declare const PBKDF2_ITERATIONS = 600000;
export declare const KEY_LENGTH = 32;
export declare const SALT_LENGTH = 16;
export declare const IV_LENGTH = 12;
export declare const AUTH_TAG_LENGTH = 16;
/**
 * Derive an AES-256 key from a password using PBKDF2.
 * If salt is not provided a random one is generated.
 */
export declare function deriveKey(password: string, salt?: string, machineId?: string): {
    key: string;
    salt: string;
};
/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns a string: `iv:authTag:ciphertext` (all hex-encoded).
 */
export declare function encrypt(text: string, key: string): string;
/**
 * Decrypt a value produced by `encrypt`.
 */
export declare function decrypt(encrypted: string, key: string): string;
