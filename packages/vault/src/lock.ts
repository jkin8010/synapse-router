import { mkdir, stat, unlink, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

export const LOCK_TIMEOUT = 5000; // ms before considering a lock stale

export async function acquireLock(
  vaultDir: string,
  instanceId: string = process.pid.toString()
): Promise<() => Promise<void>> {
  await mkdir(vaultDir, { recursive: true });
  
  const lockPath = path.join(vaultDir, "vault.lock");
  const start = Date.now();

  while (true) {
    try {
      await writeFile(lockPath, instanceId, {
        flag: "wx",
        mode: 0o600,
      });
      
      const unlock = async () => {
        try {
          const content = await readFile(lockPath, "utf8");
          if (content === instanceId) {
            await unlink(lockPath);
          }
        } catch {
          // best-effort
        }
      };
      return unlock;
    } catch (err: any) {
      if (err.code !== "EEXIST") {
        throw err;
      }

      try {
        const s = await stat(lockPath);
        if (Date.now() - s.mtimeMs > LOCK_TIMEOUT) {
          await unlink(lockPath);
          continue;
        }
      } catch {
        continue;
      }

      if (Date.now() - start > LOCK_TIMEOUT) {
        throw new Error("Could not acquire vault lock within timeout");
      }

      await new Promise(r => setTimeout(r, 50));
    }
  }
}
