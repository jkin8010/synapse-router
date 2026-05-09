import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createVault } from "../../packages/vault/src/index.ts";
import { MockServer } from "../../packages/contract-mocker/src/index.ts";
import type { Vault } from "../../packages/vault/src/index.ts";
import type { Schema } from "../../packages/core/src/index.ts";

export const ROOT = join(
  import.meta.dirname ?? __dirname,
  "..",
  ".."
);

export const PACKS_DIR = join(ROOT, "packs");

export const MINIMAL_SCHEMA: Schema = {
  name: "e2e-test",
  fields: [
    { name: "prompt", type: "string", required: true },
    { name: "model", type: "string", required: true },
  ],
};

export function createTempVault(): {
  vault: Vault;
  vaultDir: string;
  cleanup: () => void;
} {
  const vaultDir = mkdtempSync(join(tmpdir(), "e2e-vault-"));
  const vault = createVault({
    vaultDir,
    preferKeychain: false,
    audit: false,
  });
  return {
    vault,
    vaultDir,
    cleanup: () => rmSync(vaultDir, { recursive: true, force: true }),
  };
}

export async function startMockServer(
  schema: Schema = MINIMAL_SCHEMA,
  endpoint = "/chat/completions"
): Promise<{ server: MockServer; port: number }> {
  const server = new MockServer({
    schema,
    endpoint,
    method: "POST",
  });
  const port = await server.start(0);
  return { server, port };
}

export function withTempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "e2e-tmp-"));
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
