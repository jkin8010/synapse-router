import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateSdk } from "../../packages/sdk-generator/src/generator.js";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, PACKS_DIR, withTempDir } from "./helpers.js";

const OPENAI_PACK = join(PACKS_DIR, "openai");

describe("SDK compilation verification E2E", () => {
  describe("TypeScript SDK compilation", () => {
    it("generated TypeScript SDK compiles with tsc --noEmit", async () => {
      const { dir, cleanup } = withTempDir();
      try {
        const result = await generateSdk({ packDir: OPENAI_PACK, lang: "typescript", outputDir: dir });
        assert.ok(result.files.length > 0);
        writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
          compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true, skipLibCheck: true, paths: { "@synapse-router/core": [join(ROOT, "packages/core/src/index.ts")] }, baseUrl: dir },
          include: ["*.ts"],
        }));
        execSync("tsc --noEmit", { cwd: dir, stdio: "pipe", env: { ...process.env, PATH: join(ROOT, "node_modules/.bin") + ":" + (process.env.PATH || "") } });
      } finally { cleanup(); }
    }, { timeout: 30000 });
  });

  describe("Python SDK syntax verification", () => {
    it("generated Python SDK parses without syntax errors", async () => {
      const { dir, cleanup } = withTempDir();
      try {
        const result = await generateSdk({ packDir: OPENAI_PACK, lang: "python", outputDir: dir });
        assert.ok(result.files.length > 0);
        for (const file of result.files) {
          if (file.path.endsWith(".py")) execSync(`python3 -c "compile(open('${join(dir, file.path)}').read(), '${file.path}', 'exec')"`, { stdio: "pipe" });
        }
      } finally { cleanup(); }
    });
  });

  describe("SDK output structure", () => {
    it("TypeScript SDK generates expected file structure", async () => {
      const { dir, cleanup } = withTempDir();
      try {
        const result = await generateSdk({ packDir: OPENAI_PACK, lang: "typescript", outputDir: dir });
        const paths = result.files.map((f) => f.path);
        assert.ok(paths.includes("index.ts")); assert.ok(paths.includes("client.ts")); assert.ok(paths.includes("types.ts"));
        assert.ok(paths.includes("package.json")); assert.ok(paths.includes("tsconfig.json")); assert.ok(paths.includes("README.md"));
      } finally { cleanup(); }
    });
    it("Python SDK generates expected file structure", async () => {
      const { dir, cleanup } = withTempDir();
      try {
        const result = await generateSdk({ packDir: OPENAI_PACK, lang: "python", outputDir: dir });
        const paths = result.files.map((f) => f.path);
        assert.ok(paths.includes("__init__.py")); assert.ok(paths.includes("client.py")); assert.ok(paths.includes("pyproject.toml")); assert.ok(paths.includes("README.md"));
      } finally { cleanup(); }
    });
  });
});
