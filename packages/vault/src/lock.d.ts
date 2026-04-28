export declare const LOCK_TIMEOUT = 5000;
/**
 * Acquire an exclusive lock on vaultDir.
 * ALL vault instances share ONE lock file (vault.lock) — this is critical
 * for ensuring read-modify-write cycles are mutually exclusive across
 * different createVault() instances sharing the same vaultDir + password.
 *
 * The instanceId is written INTO the shared lock file so we can verify
 * ownership on unlock (only delete if we wrote our own instanceId).
 *
 * @param vaultDir Directory to lock
 * @param instanceId Unique identifier for this lock holder (written to lock file)
 */
export declare function acquireLock(vaultDir: string, instanceId?: string): Promise<() => Promise<void>>;
