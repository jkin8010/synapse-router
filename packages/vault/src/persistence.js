import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
export const VAULT_FILE = "vault.json";
export async function readVaultDataAsync(vaultDir) {
    const filePath = path.join(vaultDir, VAULT_FILE);
    try {
        await access(filePath);
    }
    catch {
        return null;
    }
    try {
        const raw = await readFile(filePath, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
/**
 * Atomic write: write to .tmp then rename (same filesystem = atomic).
 */
export async function writeVaultDataAtomic(vaultDir, data) {
    await mkdir(vaultDir, { recursive: true, mode: 0o700 });
    const targetPath = path.join(vaultDir, VAULT_FILE);
    const tmpPath = targetPath + ".tmp";
    const content = JSON.stringify(data, null, 2);
    // 1. Write to temp file with strict permissions
    await writeFile(tmpPath, content, { encoding: "utf8", mode: 0o600 });
    // 2. Atomic rename (same filesystem guarantees atomicity)
    await rename(tmpPath, targetPath);
}
//# sourceMappingURL=persistence.js.map