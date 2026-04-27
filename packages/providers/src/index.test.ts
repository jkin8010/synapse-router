import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ComfyUIProvider,
  OpenAIProvider,
  createProviderRegistry,
  getProviderRegistry,
  loadAllSpecs,
  loadProviders,
  registerProvider,
  validateSpec,
  type ProviderConfig,
  type Provider
} from "./index.js";

describe("provider registry", () => {
  test("registers and returns providers in registration order", () => {
    const registry = createProviderRegistry();
    const provider: Provider = {
      name: "custom",
      supports: (task) => task.includes("custom"),
      async generate() {
        return { image_url: "https://example.com/custom.png" };
      }
    };

    registry.registerProvider(provider);

    assert.deepEqual(registry.getProviders(), [provider]);
  });

  test("replaces providers with the same name", () => {
    const registry = createProviderRegistry();
    const first: Provider = {
      name: "custom",
      supports: () => false,
      async generate() {
        return { image_url: "https://example.com/first.png" };
      }
    };
    const second: Provider = {
      name: "custom",
      supports: () => true,
      async generate() {
        return { image_url: "https://example.com/second.png" };
      }
    };

    registry.registerProvider(first);
    registry.registerProvider(second);

    assert.deepEqual(registry.getProviders(), [second]);
  });
});

describe("user-level provider registry", () => {
  test("loads enabled providers from user provider directories", () => {
    const root = mkdtempSync(join(tmpdir(), "synapse-providers-"));
    writeUserProvider(root, "enabled-openai", true, "openai");
    writeUserProvider(root, "disabled-comfyui", false, "comfyui");

    const registry = loadProviders(root);

    assert.deepEqual(registry.getProviders().map((provider) => provider.spec.name), ["openai"]);
    assert.deepEqual(registry.getProviders()[0]?.config, { enabled: true, apiKeyEnv: "OPENAI_API_KEY" });
  });

  test("global user registry can register providers manually", () => {
    const registry = getProviderRegistry();
    const before = registry.getProviders().length;
    const config: ProviderConfig = { enabled: true };

    registerProvider({
      spec: validSpec("manual"),
      config
    });

    const providers = registry.getProviders();
    assert.equal(providers.length, before + 1);
    assert.equal(providers.at(-1)?.spec.name, "manual");
  });

  test("loadProviders rejects enabled providers with invalid specs", () => {
    const root = mkdtempSync(join(tmpdir(), "synapse-providers-"));
    const providerDir = join(root, "broken");
    mkdirSync(providerDir);
    writeFileSync(join(providerDir, "config.json"), JSON.stringify({ enabled: true }));
    writeFileSync(join(providerDir, "spec.json"), JSON.stringify({ name: "broken" }));

    assert.throws(() => loadProviders(root), /Invalid provider spec/);
  });
});

describe("provider specs", () => {
  test("loads all bundled provider specs", () => {
    const specs = loadAllSpecs();

    assert.deepEqual(specs.map((spec) => spec.name).sort(), ["comfyui", "openai"]);
    assert.equal(specs.every((spec) => validateSpec(spec).valid), true);
  });

  test("strictly validates required spec sections", () => {
    const result = validateSpec({
      name: "broken",
      version: "0.1.0",
      docs: "./README.md"
    });

    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /capabilities is required/);
    assert.match(result.errors.join("\n"), /pricing is required/);
    assert.match(result.errors.join("\n"), /limits is required/);
    assert.match(result.errors.join("\n"), /performance is required/);
  });
});

function writeUserProvider(root: string, directoryName: string, enabled: boolean, specName: string): void {
  const providerDir = join(root, directoryName);
  mkdirSync(providerDir);
  writeFileSync(join(providerDir, "config.json"), JSON.stringify({ enabled, apiKeyEnv: "OPENAI_API_KEY" }));
  writeFileSync(join(providerDir, "spec.json"), JSON.stringify(validSpec(specName)));
}

function validSpec(name: string) {
  return {
    name,
    version: "0.1.0",
    docs: "./README.md",
    capabilities: {
      tasks: ["text"],
      modalities: ["text"],
      structured_output: true
    },
    pricing: {
      unit: "mock"
    },
    limits: {
      requests_per_minute: 1
    },
    performance: {
      latency: "fast",
      reliability: "high"
    }
  };
}

describe("example providers", () => {
  test("OpenAIProvider supports text-oriented tasks and returns a mock result", async () => {
    const provider = new OpenAIProvider();

    assert.equal(provider.name, "openai");
    assert.equal(provider.supports("summarize this document"), true);
    assert.equal(provider.supports("generate image"), false);
    assert.deepEqual(await provider.generate({ task: "summarize this document" }), {
      provider: "openai",
      output: "mock-openai-result"
    });
  });

  test("ComfyUIProvider supports image tasks and returns a mock image URL", async () => {
    const provider = new ComfyUIProvider();

    assert.equal(provider.name, "comfyui");
    assert.equal(provider.supports("generate image"), true);
    assert.equal(provider.supports("summarize this document"), false);
    assert.deepEqual(await provider.generate({ task: "generate image" }), {
      provider: "comfyui",
      image_url: "https://example.com/mock-images/comfyui.png"
    });
  });
});
