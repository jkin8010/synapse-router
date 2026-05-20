/**
 * Schema Lock 核心逻辑：生成、缓存、查找
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { ProviderCard, ProviderFeature } from "@synapse-router/core";
import { LockStorage } from "./storage.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SchemaLockField {
  name: string;
  type: string;
  required?: boolean;
}

export interface SchemaLockFieldMapping {
  canonical_field: string;
  provider_field: string;
  required?: boolean;
  transform?: string;
  fallback?: unknown;
}

export interface SchemaLockConnection {
  base_url: string;
  auth_type: "Bearer" | "APIKey" | "OAuth2";
}

export interface SchemaLock {
  lock_id: string;
  intent: string;
  provider: string;
  pack_version: string;
  feature_id: string;

  input_schema: {
    fields: SchemaLockField[];
  };
  output_schema: {
    fields: Array<{ name: string; type: string }>;
  };
  field_mappings: SchemaLockFieldMapping[];

  connection: SchemaLockConnection;

  locked_at: string;
  status: "active" | "deprecated" | "migrated";
  migrated_to?: string;
}

// ─── ID Generation ──────────────────────────────────────────────────────────

/**
 * 生成唯一且可预测的 Lock ID
 * 格式: {intent}_{provider}_{packVersion}_{shortHash}
 */
export function generateLockId(
  intent: string,
  provider: string,
  packVersion: string,
  featureId: string
): string {
  const hash = createHash("sha256")
    .update(`${intent}:${provider}:${packVersion}:${featureId}`)
    .digest("hex")
    .slice(0, 8);
  // Sanitize provider for use in file paths: "aliyun/qwen-image" → "aliyun_qwen-image"
  const safeProvider = provider.replace(/\//g, "_");
  return `${intent}_${safeProvider}_v${packVersion}_${hash}`;
}

// ─── Cache Key ──────────────────────────────────────────────────────────────

/**
 * 计算缓存 key: {intent}_{provider}_{packVersion}
 * Provider name is sanitized to avoid path separator issues.
 */
export function computeCacheKey(
  intent: string,
  provider: string,
  packVersion: string
): string {
  const safeProvider = provider.replace(/\//g, "_");
  return `${intent}_${safeProvider}_v${packVersion}`;
}

// ─── Feature Matching ───────────────────────────────────────────────────────

/**
 * 在 ProviderCard 中查找匹配 intent 的 feature
 */
export function findMatchingFeature(
  card: ProviderCard,
  intent: string
): ProviderFeature | null {
  // 首先按 intent 精确匹配
  const byIntent = card.features.find((f) => f.intent === intent);
  if (byIntent) return byIntent;

  // 然后按 feature id 匹配
  const byId = card.features.find((f) => f.id === intent);
  if (byId) return byId;

  return null;
}

// ─── Build Lock from Provider Card ──────────────────────────────────────────

/**
 * 从 ProviderCard 构建 SchemaLock
 */
export function buildLockFromProviderCard(params: {
  intent: string;
  provider: string;
  packDir: string;
  card: ProviderCard;
  feature: ProviderFeature;
}): SchemaLock {
  const { intent, provider, card, feature } = params;
  const packVersion = card.service?.version ?? "0.0.0";

  return {
    lock_id: generateLockId(intent, provider, packVersion, feature.id),
    intent,
    provider,
    pack_version: packVersion,
    feature_id: feature.id,
    input_schema: {
      fields: feature.input.fields.map((f) => ({
        name: f.name,
        type: f.type,
        required: f.required,
      })),
    },
    output_schema: {
      fields: feature.output.fields.map((f) => ({
        name: f.name,
        type: f.type,
      })),
    },
    field_mappings: feature.field_mappings.map((fm) => ({
      canonical_field: fm.canonical_field,
      provider_field: fm.provider_field,
      required: fm.required,
      transform: fm.transform,
      fallback: fm.fallback,
    })),
    connection: {
      base_url: card.service?.base_url ?? "",
      auth_type: card.service?.auth_type ?? "",
    },
    locked_at: new Date().toISOString(),
    status: "active",
  };
}

// ─── Get or Create Lock ─────────────────────────────────────────────────────

export interface GetOrCreateLockParams {
  intent: string;
  provider: string;
  packDir: string;   // packs/ directory path
  configDir: string;  // ~/.synapse/ directory path
  card?: ProviderCard; // Optional: already loaded provider card (from connect)
}

/**
 * 获取或创建 Lock
 * 1. 计算缓存 key
 * 2. 检查 ~/.synapse/schemas/ 下是否有缓存
 * 3. 存在 → 返回缓存的 Lock
 * 4. 不存在 → 从 provider-card.json 构建 → 缓存
 */
export async function getOrCreateLock(
  params: GetOrCreateLockParams
): Promise<{ lock: SchemaLock; cached: boolean }> {
  const { intent, provider, packDir, configDir, card: preloadedCard } = params;

  // 1. Load the provider card to determine pack version and feature
  // Resolve which pack to use (provider might use a different pack, e.g. deepseek uses openai pack)
  // For lock, we load from the provider's own pack directory first
  let card: ProviderCard | null = preloadedCard ?? null;

  // Try provider-specific pack first
  if (!card) {
    const cardPath = join(packDir, provider, "provider-card.json");
    try {
      const content = await readFile(cardPath, "utf8");
      card = JSON.parse(content) as ProviderCard;
    } catch {
      // Loading from preloaded card is preferred (handles config mapping)
    }
  }

  if (!card) {
    throw new Error(
      `Provider pack not found for "${provider}". ` +
      `Ensure the pack exists in ${packDir}/${provider}/`
    );
  }

  const feature = findMatchingFeature(card, intent);
  if (!feature) {
    throw new Error(
      `No feature found for intent "${intent}" in pack "${provider}". ` +
      `Available intents: ${card.features.map((f) => f.intent).join(", ")}`
    );
  }

  const packVersion = card.service?.version ?? "0.0.0";
  const cacheKey = computeCacheKey(intent, provider, packVersion);

  // 2. Check cache
  const schemasDir = join(configDir, "schemas");
  const storage = new LockStorage(schemasDir);

  const cached = await storage.findByCacheKey(intent, provider, packVersion);
  if (cached && cached.status === "active") {
    // Invalidate cache if provider pack connection config changed
    // (e.g. registry updated the pack with a new base_url)
    const cachedConn = cached.connection || {};
    const currentBaseUrl = card.service?.base_url ?? "";
    const currentAuthType = card.service?.auth_type ?? "";
    if (cachedConn.base_url !== currentBaseUrl || cachedConn.auth_type !== currentAuthType) {
      await storage.remove(cached.lock_id);
    } else {
      return { lock: cached, cached: true };
    }
  }

  // 3. Build new lock
  const lock = buildLockFromProviderCard({
    intent,
    provider,
    packDir,
    card,
    feature,
  });

  // 4. Save to cache
  await storage.save(lock);

  return { lock, cached: false };
}

// ─── Outdated Detection ─────────────────────────────────────────────────────

export interface OutdatedLockInfo {
  lock: SchemaLock;
  current_pack_version: string;
  outdated: boolean;
}

/**
 * 检测哪些 Lock 已过期（Pack 版本已更新）
 */
export async function detectOutdatedLocks(
  configDir: string,
  packDir: string
): Promise<OutdatedLockInfo[]> {
  const schemasDir = join(configDir, "schemas");
  const storage = new LockStorage(schemasDir);
  const locks = await storage.list();
  const results: OutdatedLockInfo[] = [];

  for (const lock of locks) {
    if (lock.status !== "active") continue;

    let currentVersion = lock.pack_version;
    try {
      const cardPath = join(packDir, lock.provider, "provider-card.json");
      const content = await readFile(cardPath, "utf8");
      const card = JSON.parse(content) as ProviderCard;
      currentVersion = card.service?.version ?? lock.pack_version;
    } catch {
      // Pack not found, can't determine current version
    }

    results.push({
      lock,
      current_pack_version: currentVersion,
      outdated: currentVersion !== lock.pack_version,
    });
  }

  return results;
}
