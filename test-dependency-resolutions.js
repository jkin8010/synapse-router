#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper to load local module
async function loadLocalModule(name, distPath) {
  try {
    console.log(`🔍 Loading ${name} from ${distPath}`);
    const mod = await import(distPath);
    console.log(`✅ ${name} imported successfully!`);
    return { mod, error: null };
  } catch (err) {
    console.error(`❌ Failed to load ${name}: ${err.message}`);
    return { mod: null, error: err };
  }
}

// Test all packages directly from dist
async function run() {
  console.log("📦 Testing Synapse Router package inter-dependency resolution");
  console.log("=".repeat(70));
  console.log();

  const packages = [
    {
      name: "@synapse-router/core",
      path: join(__dirname, "packages", "core", "dist", "index.js")
    },
    {
      name: "@synapse-router/negotiator",
      path: join(__dirname, "packages", "negotiator", "dist", "index.js")
    },
    {
      name: "@synapse-router/vault",
      path: join(__dirname, "packages", "vault", "dist", "index.js")
    },
    {
      name: "@synapse-router/router",
      path: join(__dirname, "packages", "router", "dist", "index.js")
    },
    {
      name: "@synapse-router/sdk",
      path: join(__dirname, "packages", "sdk", "dist", "index.js")
    },
    {
      name: "@synapse-router/pack-generator",
      path: join(__dirname, "packages", "pack-generator", "dist", "index.js")
    },
    {
      name: "@synapse-router/providers",
      path: join(__dirname, "packages", "providers", "dist", "index.js")
    },
    // Apps
    {
      name: "@synapse-router/api",
      path: join(__dirname, "apps", "api", "dist", "index.js")
    }
  ];

  const results = [];
  for (const pkg of packages) {
    results.push(await loadLocalModule(pkg.name, pkg.path));
  }

  console.log();
  console.log("=".repeat(70));
  console.log(`📊 Summary: ${results.filter(r => !r.error).length}/${results.length} packages successfully imported`);
  
  const errors = results.filter(r => r.error).map(r => r.error.message);
  if (errors.length > 0) {
    console.log("\n⚠️ Errors encountered:");
    errors.forEach(err => console.log(`  • ${err}`));
  }

  console.log();

  // Test usage
  const coreResult = results.find(r => r.mod && r.mod.validateSchema);
  if (coreResult) {
    const { validateSchema } = coreResult.mod;
    console.log("🧪 Testing validateSchema from core:");
    const schemaTest = validateSchema({
      name: "test",
      fields: [{ name: "x", type: "string" }]
    });
    console.log(`  Schema validation passed? ${schemaTest.valid}`);
  }

  const vaultResult = results.find(r => r.mod && r.mod.createVault);
  if (vaultResult) {
    const { createVault } = vaultResult.mod;
    console.log("\n🔐 Testing vault creation from vault package:");
    console.log(`  createVault is callable? ${typeof createVault === "function"}`);
  }

  const negotiatorResult = results.find(r => r.mod && r.mod.negotiateSchema);
  if (negotiatorResult) {
    console.log("\n🤝 Testing negotiateSchema from negotiator:");
    console.log(`  negotiateSchema is callable? ${typeof negotiatorResult.mod.negotiateSchema === "function"}`);
  }
}

run();
