import type { VaultData } from "./types.js";
export declare const VAULT_FILE = "vault.json";
export declare function readVaultDataAsync(vaultDir: string): Promise<VaultData | null>;
/**
 * Atomic write: write to .tmp then rename (same filesystem = atomic).
 */
export declare function writeVaultDataAtomic(vaultDir: string, data: VaultData): Promise<void>;
