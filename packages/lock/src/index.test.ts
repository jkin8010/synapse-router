/**
 * @synapse-router/lock — Tests
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  SchemaLock,
  generateLockId,
  computeCacheKey,
  findMatchingFeature,
  buildLockFromProviderCard,
  getOrCreateLock,
  detectOutdatedLocks,
} from "./lock.js";
import { LockStorage } from "./storage.js";
import { migrateLock } from "./migrate.js";

// ─── Test Fixtures ──────────────────────────────────────────────────────────

const MOCK_PROVIDER_CARD = {
  provider: { id: "openai", name: "OpenAI", docs_url: "https://example.com" },
  service: {
    id: "openai",
    name: "OpenAI",
    version: "1.0.0",
    api_version: "2024-01-01",
    base_url: "https://api.openai.com/v1",
    auth_type: "Bearer" as const,
  },
  features: [
    {
      id: "chat_post_v1_chat_completions",
      intent: "chat",
      name: "Chat Completions",
      description: "Generate chat-based language model responses",
      input: {
        name: "ChatCompletionInput",
        fields: [
          { name: "messages", type: "array", required: true },
          { name: "model", type: "string", required: true },
          { name: "temperature", type: "number", required: false },
        ],
      },
      output: {
        name: "ChatCompletionOutput",
        fields: [
          { name: "id", type: "string" },
          { name: "choices", type: "array" },
        ],
      },
      field_mappings: [
        { canonical_field: "prompt", provider_field: "messages", required: true },
        { canonical_field: "model", provider_field: "model", required: true },
        { canonical_field: "temperature", provider_field: "temperature", required: false, fallback: 0.7 },
      ],
      pricing: { input: 0.0015, output: 0.002, unit: "1k tokens" },
      limits: { rpm: 500 },
    },
    {
      id: "embeddings_post_v1_embeddings",
      intent: "embeddings",
      name: "Embeddings",
      input: {
        name: "EmbeddingsInput",
        fields: [
          { name: "input", type: "array", required: true },
          { name: "model", type: "string", required: true },
        ],
      },
      output: {
        name: "EmbeddingsOutput",
        fields: [
          { name: "data", type: "array" },
          { name: "model", type: "string" },
        ],
      },
      field_mappings: [
        { canonical_field: "texts", provider_field: "input", required: true },
        { canonical_field: "model", provider_field: "model", required: true },
      ],
    },
  ],
};

const MOCK_PROVIDER_CARD_V2 = {
  ...MOCK_PROVIDER_CARD,
  service: {
    ...MOCK_PROVIDER_CARD.service,
    version: "2.0.0",
  },
  features: [
    {
      ...MOCK_PROVIDER_CARD.features[0],
      input: {
        ...MOCK_PROVIDER_CARD.features[0].input,
        fields: [
          { name: "messages", type: "array", required: true },
          { name: "model", type: "string", required: true },
          { name: "temperature", type: "number", required: false },
          { name: "reasoning_effort", type: "string", required: false }, // NEW field
        ],
      },
      field_mappings: [
        { canonical_field: "prompt", provider_field: "messages", required: true },
        { canonical_field: "model", provider_field: "model", required: true },
        { canonical_field: "temperature", provider_field: "temperature_v2", required: false }, // Changed mapping
        { canonical_field: "reasoning_effort", provider_field: "reasoning_effort", required: false },
      ],
    },
    MOCK_PROVIDER_CARD.features[1],
  ],
};

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "synapse-lock-test-"));
}

async function createPackDir(base: string, card: object, providerId: string = "openai"): Promise<string> {
  const packDir = join(base, "packs", providerId);
  await mkdir(packDir, { recursive: true });
  await writeFile(join(packDir, "provider-card.json"), JSON.stringify(card, null, 2), "utf8");
  return join(base, "packs");
}

async function createConfigDir(base: string): Promise<string> {
  const configDir = join(base, ".synapse");
  await mkdir(configDir, { recursive: true });
  return configDir;
}

// ─── generateLockId ─────────────────────────────────────────────────────────

describe("generateLockId", () => {
  it("generates unique and predictable lock IDs", () => {
    const id1 = generateLockId("chat", "openai", "1.0.0", "chat_post_v1_chat_completions");
    const id2 = generateLockId("chat", "openai", "1.0.0", "chat_post_v1_chat_completions");
    const id3 = generateLockId("chat", "deepseek", "1.0.0", "chat_post_v1_chat_completions");

    assert.ok(id1.startsWith("chat_openai_v1.0.0_"));
    assert.equal(id1, id2, "Same inputs should produce same ID");
    assert.notEqual(id1, id3, "Different providers should produce different IDs");
  });
});

// ─── computeCacheKey ────────────────────────────────────────────────────────

describe("computeCacheKey", () => {
  it("computes cache key from intent, provider, and pack version", () => {
    const key = computeCacheKey("chat", "openai", "1.0.0");
    assert.equal(key, "chat_openai_v1.0.0");
  });
});

// ─── findMatchingFeature ────────────────────────────────────────────────────

describe("findMatchingFeature", () => {
  it("finds feature by intent", () => {
    const feature = findMatchingFeature(MOCK_PROVIDER_CARD, "chat");
    assert.ok(feature);
    assert.equal(feature!.intent, "chat");
    assert.equal(feature!.id, "chat_post_v1_chat_completions");
  });

  it("finds feature by id", () => {
    const feature = findMatchingFeature(MOCK_PROVIDER_CARD, "chat_post_v1_chat_completions");
    assert.ok(feature);
    assert.equal(feature!.id, "chat_post_v1_chat_completions");
  });

  it("returns null for unknown intent", () => {
    const feature = findMatchingFeature(MOCK_PROVIDER_CARD, "unknown");
    assert.equal(feature, null);
  });
});

// ─── buildLockFromProviderCard ──────────────────────────────────────────────

describe("buildLockFromProviderCard", () => {
  it("builds a lock from provider card and feature", () => {
    const feature = MOCK_PROVIDER_CARD.features[0];
    const lock = buildLockFromProviderCard({
      intent: "chat",
      provider: "openai",
      packDir: "/tmp/packs",
      card: MOCK_PROVIDER_CARD,
      feature,
    });

    assert.equal(lock.intent, "chat");
    assert.equal(lock.provider, "openai");
    assert.equal(lock.pack_version, "1.0.0");
    assert.equal(lock.feature_id, "chat_post_v1_chat_completions");
    assert.equal(lock.status, "active");
    assert.equal(lock.input_schema.fields.length, 3);
    assert.equal(lock.output_schema.fields.length, 2);
    assert.equal(lock.field_mappings.length, 3);
    assert.equal(lock.connection.base_url, "https://api.openai.com/v1");
    assert.equal(lock.connection.auth_type, "Bearer");
    assert.ok(lock.locked_at);
    assert.ok(lock.lock_id);
  });
});

// ─── LockStorage ────────────────────────────────────────────────────────────

describe("LockStorage", () => {
  it("saves and loads a lock", async () => {
    const tempDir = await createTempDir();
    try {
      const storage = new LockStorage(join(tempDir, "schemas"));

      const lock: SchemaLock = {
        lock_id: "chat_openai_v1.0.0_abc12345",
        intent: "chat",
        provider: "openai",
        pack_version: "1.0.0",
        feature_id: "chat_post_v1_chat_completions",
        input_schema: { fields: [{ name: "messages", type: "array", required: true }] },
        output_schema: { fields: [{ name: "id", type: "string" }] },
        field_mappings: [{ canonical_field: "prompt", provider_field: "messages", required: true }],
        connection: { base_url: "https://api.openai.com/v1", auth_type: "Bearer" },
        locked_at: new Date().toISOString(),
        status: "active",
      };

      await storage.save(lock);
      const loaded = await storage.load(lock.lock_id);
      assert.ok(loaded);
      assert.equal(loaded!.lock_id, lock.lock_id);
      assert.equal(loaded!.intent, "chat");
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it("finds lock by cache key", async () => {
    const tempDir = await createTempDir();
    try {
      const storage = new LockStorage(join(tempDir, "schemas"));

      const lock: SchemaLock = {
        lock_id: "chat_openai_v1.0.0_abc12345",
        intent: "chat",
        provider: "openai",
        pack_version: "1.0.0",
        feature_id: "chat_post_v1_chat_completions",
        input_schema: { fields: [{ name: "messages", type: "array", required: true }] },
        output_schema: { fields: [{ name: "id", type: "string" }] },
        field_mappings: [{ canonical_field: "prompt", provider_field: "messages", required: true }],
        connection: { base_url: "https://api.openai.com/v1", auth_type: "Bearer" },
        locked_at: new Date().toISOString(),
        status: "active",
      };

      await storage.save(lock);
      const found = await storage.findByCacheKey("chat", "openai", "1.0.0");
      assert.ok(found);
      assert.equal(found!.lock_id, lock.lock_id);

      const notFound = await storage.findByCacheKey("embeddings", "openai", "1.0.0");
      assert.equal(notFound, null);
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it("lists all locks", async () => {
    const tempDir = await createTempDir();
    try {
      const storage = new LockStorage(join(tempDir, "schemas"));

      const lock1: SchemaLock = {
        lock_id: "chat_openai_v1.0.0_aaaaaaaa",
        intent: "chat",
        provider: "openai",
        pack_version: "1.0.0",
        feature_id: "chat_post_v1_chat_completions",
        input_schema: { fields: [] },
        output_schema: { fields: [] },
        field_mappings: [],
        connection: { base_url: "https://api.openai.com/v1", auth_type: "Bearer" },
        locked_at: new Date().toISOString(),
        status: "active",
      };

      const lock2: SchemaLock = {
        lock_id: "embeddings_openai_v1.0.0_bbbbbbbb",
        intent: "embeddings",
        provider: "openai",
        pack_version: "1.0.0",
        feature_id: "embeddings_post_v1_embeddings",
        input_schema: { fields: [] },
        output_schema: { fields: [] },
        field_mappings: [],
        connection: { base_url: "https://api.openai.com/v1", auth_type: "Bearer" },
        locked_at: new Date().toISOString(),
        status: "active",
      };

      await storage.save(lock1);
      await storage.save(lock2);
      const locks = await storage.list();
      assert.equal(locks.length, 2);
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it("removes a lock", async () => {
    const tempDir = await createTempDir();
    try {
      const storage = new LockStorage(join(tempDir, "schemas"));

      const lock: SchemaLock = {
        lock_id: "chat_openai_v1.0.0_abc12345",
        intent: "chat",
        provider: "openai",
        pack_version: "1.0.0",
        feature_id: "chat_post_v1_chat_completions",
        input_schema: { fields: [] },
        output_schema: { fields: [] },
        field_mappings: [],
        connection: { base_url: "https://api.openai.com/v1", auth_type: "Bearer" },
        locked_at: new Date().toISOString(),
        status: "active",
      };

      await storage.save(lock);
      const removed = await storage.remove(lock.lock_id);
      assert.equal(removed, true);

      const loaded = await storage.load(lock.lock_id);
      assert.equal(loaded, null);
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it("deprecates a lock", async () => {
    const tempDir = await createTempDir();
    try {
      const storage = new LockStorage(join(tempDir, "schemas"));

      const lock: SchemaLock = {
        lock_id: "chat_openai_v1.0.0_abc12345",
        intent: "chat",
        provider: "openai",
        pack_version: "1.0.0",
        feature_id: "chat_post_v1_chat_completions",
        input_schema: { fields: [] },
        output_schema: { fields: [] },
        field_mappings: [],
        connection: { base_url: "https://api.openai.com/v1", auth_type: "Bearer" },
        locked_at: new Date().toISOString(),
        status: "active",
      };

      await storage.save(lock);
      await storage.deprecate(lock.lock_id, "chat_openai_v2.0.0_newhash1");

      const loaded = await storage.load(lock.lock_id);
      assert.ok(loaded);
      assert.equal(loaded!.status, "deprecated");
      assert.equal(loaded!.migrated_to, "chat_openai_v2.0.0_newhash1");
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });
});

// ─── getOrCreateLock ────────────────────────────────────────────────────────

describe("getOrCreateLock", () => {
  it("creates a new lock on first call", async () => {
    const tempDir = await createTempDir();
    try {
      const packDir = await createPackDir(tempDir, MOCK_PROVIDER_CARD);
      const configDir = await createConfigDir(tempDir);

      const { lock, cached } = await getOrCreateLock({
        intent: "chat",
        provider: "openai",
        packDir,
        configDir,
      });

      assert.equal(cached, false);
      assert.equal(lock.intent, "chat");
      assert.equal(lock.provider, "openai");
      assert.equal(lock.pack_version, "1.0.0");
      assert.equal(lock.status, "active");
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it("returns cached lock on second call", async () => {
    const tempDir = await createTempDir();
    try {
      const packDir = await createPackDir(tempDir, MOCK_PROVIDER_CARD);
      const configDir = await createConfigDir(tempDir);

      const first = await getOrCreateLock({
        intent: "chat",
        provider: "openai",
        packDir,
        configDir,
      });
      assert.equal(first.cached, false);

      const second = await getOrCreateLock({
        intent: "chat",
        provider: "openai",
        packDir,
        configDir,
      });
      assert.equal(second.cached, true);
      assert.equal(second.lock.lock_id, first.lock.lock_id);
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it("throws on unknown provider", async () => {
    const tempDir = await createTempDir();
    try {
      const packDir = await createPackDir(tempDir, MOCK_PROVIDER_CARD);
      const configDir = await createConfigDir(tempDir);

      await assert.rejects(
        () => getOrCreateLock({ intent: "chat", provider: "unknown", packDir, configDir }),
        /Provider pack not found/
      );
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it("throws on unknown intent", async () => {
    const tempDir = await createTempDir();
    try {
      const packDir = await createPackDir(tempDir, MOCK_PROVIDER_CARD);
      const configDir = await createConfigDir(tempDir);

      await assert.rejects(
        () => getOrCreateLock({ intent: "unknown", provider: "openai", packDir, configDir }),
        /No feature found/
      );
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });
});

// ─── migrateLock ────────────────────────────────────────────────────────────

describe("migrateLock", () => {
  it("detects breaking changes when migrating to new pack version", async () => {
    const tempDir = await createTempDir();
    try {
      // Create v1 pack
      const packDir = await createPackDir(tempDir, MOCK_PROVIDER_CARD);
      const configDir = await createConfigDir(tempDir);

      // Create initial lock
      const { lock: oldLock } = await getOrCreateLock({
        intent: "chat",
        provider: "openai",
        packDir,
        configDir,
      });

      // Now upgrade to v2 pack
      await createPackDir(tempDir, MOCK_PROVIDER_CARD_V2);

      // Migrate
      const result = await migrateLock(oldLock, packDir, configDir);

      assert.equal(result.old_lock_id, oldLock.lock_id);
      assert.ok(result.new_lock_id);
      assert.ok(result.breaking_changes.length > 0, "Should detect breaking changes");

      // Should detect added field: input.reasoning_effort
      const addedField = result.breaking_changes.find(
        (c) => c.field === "input.reasoning_effort" && c.change === "added"
      );
      assert.ok(addedField, "Should detect added field reasoning_effort");

      // Should detect field mapping change: temperature → temperature_v2
      assert.ok(result.field_mapping_changes.length > 0, "Should detect field mapping changes");
      const tempChange = result.field_mapping_changes.find(
        (c) => c.canonical_field === "temperature"
      );
      assert.ok(tempChange, "Should detect temperature mapping change");
      assert.equal(tempChange!.old_provider_field, "temperature");
      assert.equal(tempChange!.new_provider_field, "temperature_v2");
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it("deprecates old lock after migration", async () => {
    const tempDir = await createTempDir();
    try {
      const packDir = await createPackDir(tempDir, MOCK_PROVIDER_CARD);
      const configDir = await createConfigDir(tempDir);

      const { lock: oldLock } = await getOrCreateLock({
        intent: "chat",
        provider: "openai",
        packDir,
        configDir,
      });

      // Upgrade to v2
      await createPackDir(tempDir, MOCK_PROVIDER_CARD_V2);

      await migrateLock(oldLock, packDir, configDir);

      // Old lock should be deprecated
      const storage = new LockStorage(join(configDir, "schemas"));
      const loadedOld = await storage.load(oldLock.lock_id);
      assert.ok(loadedOld);
      assert.equal(loadedOld!.status, "deprecated");
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });
});

// ─── detectOutdatedLocks ────────────────────────────────────────────────────

describe("detectOutdatedLocks", () => {
  it("detects outdated locks when pack version changes", async () => {
    const tempDir = await createTempDir();
    try {
      const packDir = await createPackDir(tempDir, MOCK_PROVIDER_CARD);
      const configDir = await createConfigDir(tempDir);

      // Create lock with v1
      await getOrCreateLock({
        intent: "chat",
        provider: "openai",
        packDir,
        configDir,
      });

      // Upgrade pack to v2
      await createPackDir(tempDir, MOCK_PROVIDER_CARD_V2);

      const outdated = await detectOutdatedLocks(configDir, packDir);
      assert.equal(outdated.length, 1);
      assert.equal(outdated[0].outdated, true);
      assert.equal(outdated[0].current_pack_version, "2.0.0");
      assert.equal(outdated[0].lock.pack_version, "1.0.0");
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });

  it("returns no outdated locks when versions match", async () => {
    const tempDir = await createTempDir();
    try {
      const packDir = await createPackDir(tempDir, MOCK_PROVIDER_CARD);
      const configDir = await createConfigDir(tempDir);

      await getOrCreateLock({
        intent: "chat",
        provider: "openai",
        packDir,
        configDir,
      });

      const outdated = await detectOutdatedLocks(configDir, packDir);
      assert.equal(outdated.length, 1);
      assert.equal(outdated[0].outdated, false);
    } finally {
      await rm(tempDir, { recursive: true });
    }
  });
});
