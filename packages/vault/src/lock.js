import { mkdir, stat, unlink, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
export const LOCK_TIMEOUT = 5000; // ms before considering a lock stale
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
export async function acquireLock(vaultDir, instanceId = process.pid.toString()) {
    await mkdir(vaultDir, { recursive: true });
    // ALL instances use the SAME lock file — this is what enforces mutual
    // exclusion across different createVault() calls sharing vaultDir.
    const lockPath = path.join(vaultDir, "vault.lock");
    const start = Date.now();
    while (true) {
        try {
            // Write our instanceId as the lock file content (for ownership verification on unlock)
            await writeFile(lockPath, instanceId, {
                flag: "wx",
                mode: 0o600,
            });
            break; // Lock acquired
        }
        catch (err) {
            if (err.code !== "EEXIST")
                throw err;
            // Check if the lock is stale (older than LOCK_TIMEOUT ms)
            try {
                const s = await stat(lockPath);
                if (Date.now() - s.mtimeMs > LOCK_TIMEOUT) {
                    await unlink(lockPath);
                    continue; // Retry acquiring
                }
            }
            catch {
                // Lock file disappeared between check and unlink, retry
                continue;
            }
            if (Date.now() - start > LOCK_TIMEOUT) {
                throw new Error("Could not acquire vault lock within timeout");
            }
            // Wait and retry
            await new Promise((r) => setTimeout(r, 50));
        }
    }
    return async () => {
        try {
            // Only delete if this instance owns the lock (content matches our instanceId)
            const content = await readFile(lockPath, "utf8");
            if (content === instanceId) {
                await unlink(lockPath);
            }
        }
        catch {
            // best-effort
        }
    };
}
//# sourceMappingURL=lock.js.map