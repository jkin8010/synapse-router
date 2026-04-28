import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "url";
import { createServer } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const vaultDir = path.join(repoRoot, ".debug-vault");
const packsDir = path.join(repoRoot, "packs");
console.log("packsDir:", packsDir);
const server = createServer({ vaultDir, packsDir, port: 0 }) as http.Server;

server.listen(0, async () => {
  const addr = server.address() as any;
  const baseUrl = `http://localhost:${addr.port}`;

  // Wait for ready
  if ((server as any)._readyPromise) {
    await (server as any)._readyPromise;
  }

  const providers = (server as any)._providers;
  console.log("Loaded providers:", [...providers.keys()]);

  // Test /providers
  await new Promise<void>((resolve) => {
    http.get(`${baseUrl}/providers`, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        console.log("\n/providers Status:", res.statusCode);
        console.log("Body:", data.substring(0, 500));
        resolve();
      });
    });
  });

  server.close();
  process.exit(0);
});
