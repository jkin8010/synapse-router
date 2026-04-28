export { deriveKey, encrypt, decrypt } from "./crypto.js";
export type { VaultConfig, VaultEntry, Vault, AuditEvent, AuditLogger, AuditAction, KeychainProvider, } from "./types.js";
export { FileAuditLogger, NoopAuditLogger, } from "./audit.js";
export { MacOSKeychain, LinuxKeychain, NoKeychain, getKeychainProvider, KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, } from "./keychain.js";
import type { VaultConfig, Vault } from "./types.js";
/**
 * Get machine-specific identifier (async).
 */
export declare function getMachineIdAsync(): Promise<string | null>;
/** Synchronous version kept for backwards compatibility / tests */
export declare function getMachineId(): string | null;
export declare function createVault(config?: Partial<VaultConfig>): Vault;
