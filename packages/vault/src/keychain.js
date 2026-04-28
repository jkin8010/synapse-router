import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
// ---------------------------------------------------------------------------
// Keychain service name used by Synapse Router
// ---------------------------------------------------------------------------
export const KEYCHAIN_SERVICE = "synapse-router";
export const KEYCHAIN_ACCOUNT = "vault-encryption-key";
// ---------------------------------------------------------------------------
// macOS Keychain provider using `security` CLI
// ---------------------------------------------------------------------------
export class MacOSKeychain {
    async isAvailable() {
        try {
            await execFileAsync("security", [
                "find-generic-password",
                "-s", "synapse-router-connectivity-check",
                "-w",
            ]);
            return true; // command executed — keychain is reachable
        }
        catch (err) {
            // err.status === 44 means item not found, which still means keychain is available
            return err.status === 44;
        }
    }
    async set(service, account, secret) {
        // Delete existing first (security add-generic-password fails if duplicate)
        try {
            await this.delete(service, account);
        }
        catch {
            // ignore
        }
        await execFileAsync("security", [
            "add-generic-password",
            "-a", account,
            "-s", service,
            "-w", secret,
        ]);
    }
    async get(service, account) {
        try {
            const { stdout } = await execFileAsync("security", [
                "find-generic-password",
                "-a", account,
                "-s", service,
                "-w",
            ]);
            return stdout.trim();
        }
        catch {
            return null;
        }
    }
    async delete(service, account) {
        try {
            await execFileAsync("security", [
                "delete-generic-password",
                "-a", account,
                "-s", service,
            ]);
            return true;
        }
        catch {
            return false;
        }
    }
}
// ---------------------------------------------------------------------------
// Linux libsecret provider using `secret-tool` CLI
// ---------------------------------------------------------------------------
export class LinuxKeychain {
    async isAvailable() {
        try {
            await execFileAsync("which", ["secret-tool"]);
            return true;
        }
        catch {
            return false;
        }
    }
    async set(service, account, secret) {
        // secret-tool reads secret value from stdin
        const { execFileSync } = await import("node:child_process");
        execFileSync("secret-tool", [
            "store",
            "--label", `Synapse Router: ${account}`,
            "service", service,
            "account", account,
        ], { input: secret + "\n" });
    }
    async get(service, account) {
        try {
            const { stdout } = await execFileAsync("secret-tool", [
                "lookup",
                "service", service,
                "account", account,
            ]);
            return stdout.trim();
        }
        catch {
            return null;
        }
    }
    async delete(service, account) {
        try {
            await execFileAsync("secret-tool", [
                "clear",
                "service", service,
                "account", account,
            ]);
            return true;
        }
        catch {
            return false;
        }
    }
}
// ---------------------------------------------------------------------------
// No-op fallback when no keychain is available
// ---------------------------------------------------------------------------
export class NoKeychain {
    async isAvailable() {
        return false;
    }
    async set() {
        throw new Error("No keychain available on this platform");
    }
    async get() {
        return null;
    }
    async delete() {
        return false;
    }
}
// ---------------------------------------------------------------------------
// Auto-detect and return the appropriate keychain provider
// ---------------------------------------------------------------------------
export async function getKeychainProvider() {
    if (process.platform === "darwin") {
        const kc = new MacOSKeychain();
        if (await kc.isAvailable())
            return kc;
    }
    else if (process.platform === "linux") {
        const kc = new LinuxKeychain();
        if (await kc.isAvailable())
            return kc;
    }
    return new NoKeychain();
}
//# sourceMappingURL=keychain.js.map