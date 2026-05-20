/**
 * Schema Lock 迁移逻辑
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProviderCard } from "@synapse-router/core";
import type { SchemaLock } from "./lock.js";
import { buildLockFromProviderCard, findMatchingFeature, generateLockId } from "./lock.js";
import { LockStorage } from "./storage.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MigrationBreakingChange {
  field: string;
  change: "added" | "removed" | "type_changed";
  old_value?: string;
  new_value?: string;
}

export interface MigrationFieldMappingChange {
  canonical_field: string;
  old_provider_field: string;
  new_provider_field: string;
}

export interface MigrationResult {
  old_lock_id: string;
  new_lock_id: string;
  breaking_changes: MigrationBreakingChange[];
  field_mapping_changes: MigrationFieldMappingChange[];
}

// ─── Migration ──────────────────────────────────────────────────────────────

/**
 * 迁移 Lock 到最新 Pack 版本
 */
export async function migrateLock(
  oldLock: SchemaLock,
  newPackDir: string,
  configDir: string
): Promise<MigrationResult> {
  // 1. Load the new provider card
  const providerDir = oldLock.provider.includes("/") ? oldLock.provider.replace("/", "__") : oldLock.provider;
  const cardPath = join(newPackDir, providerDir, "provider-card.json");
  let card: ProviderCard;
  try {
    const content = await readFile(cardPath, "utf8");
    card = JSON.parse(content) as ProviderCard;
  } catch {
    throw new Error(`Provider pack not found for "${oldLock.provider}" at ${newPackDir}`);
  }

  // 2. Find the matching feature
  const feature = findMatchingFeature(card, oldLock.intent);
  if (!feature) {
    throw new Error(
      `No feature found for intent "${oldLock.intent}" in pack "${oldLock.provider}"`
    );
  }

  // 3. Build new lock
  const newLock = buildLockFromProviderCard({
    intent: oldLock.intent,
    provider: oldLock.provider,
    packDir: newPackDir,
    card,
    feature,
  });

  // 4. Detect breaking changes
  const breakingChanges = detectBreakingChanges(oldLock, newLock);

  // 5. Detect field mapping changes
  const fieldMappingChanges = detectFieldMappingChanges(oldLock, newLock);

  // 6. Deprecate old lock and save new one
  const schemasDir = join(configDir, "schemas");
  const storage = new LockStorage(schemasDir);

  await storage.deprecate(oldLock.lock_id, newLock.lock_id);
  await storage.save(newLock);

  return {
    old_lock_id: oldLock.lock_id,
    new_lock_id: newLock.lock_id,
    breaking_changes: breakingChanges,
    field_mapping_changes: fieldMappingChanges,
  };
}

// ─── Change Detection ───────────────────────────────────────────────────────

/**
 * 检测 input/output schema 的 breaking changes
 */
function detectBreakingChanges(
  oldLock: SchemaLock,
  newLock: SchemaLock
): MigrationBreakingChange[] {
  const changes: MigrationBreakingChange[] = [];

  // Check input schema
  const oldInputFields = new Map(
    oldLock.input_schema.fields.map((f) => [f.name, f])
  );
  const newInputFields = new Map(
    newLock.input_schema.fields.map((f) => [f.name, f])
  );

  // Removed fields (breaking)
  for (const [name, field] of oldInputFields) {
    if (!newInputFields.has(name)) {
      changes.push({
        field: `input.${name}`,
        change: "removed",
        old_value: field.type,
      });
    }
  }

  // Added fields
  for (const [name, field] of newInputFields) {
    if (!oldInputFields.has(name)) {
      changes.push({
        field: `input.${name}`,
        change: "added",
        new_value: field.type,
      });
    }
  }

  // Type changes
  for (const [name, newField] of newInputFields) {
    const oldField = oldInputFields.get(name);
    if (oldField && oldField.type !== newField.type) {
      changes.push({
        field: `input.${name}`,
        change: "type_changed",
        old_value: oldField.type,
        new_value: newField.type,
      });
    }
  }

  // Check output schema
  const oldOutputFields = new Map(
    oldLock.output_schema.fields.map((f) => [f.name, f])
  );
  const newOutputFields = new Map(
    newLock.output_schema.fields.map((f) => [f.name, f])
  );

  for (const [name, field] of oldOutputFields) {
    if (!newOutputFields.has(name)) {
      changes.push({
        field: `output.${name}`,
        change: "removed",
        old_value: field.type,
      });
    }
  }

  for (const [name, field] of newOutputFields) {
    if (!oldOutputFields.has(name)) {
      changes.push({
        field: `output.${name}`,
        change: "added",
        new_value: field.type,
      });
    }
  }

  for (const [name, newField] of newOutputFields) {
    const oldField = oldOutputFields.get(name);
    if (oldField && oldField.type !== newField.type) {
      changes.push({
        field: `output.${name}`,
        change: "type_changed",
        old_value: oldField.type,
        new_value: newField.type,
      });
    }
  }

  return changes;
}

/**
 * 检测 field_mappings 的变更
 */
function detectFieldMappingChanges(
  oldLock: SchemaLock,
  newLock: SchemaLock
): MigrationFieldMappingChange[] {
  const changes: MigrationFieldMappingChange[] = [];

  const oldMappings = new Map(
    oldLock.field_mappings.map((fm) => [fm.canonical_field, fm])
  );
  const newMappings = new Map(
    newLock.field_mappings.map((fm) => [fm.canonical_field, fm])
  );

  for (const [canonicalField, newMapping] of newMappings) {
    const oldMapping = oldMappings.get(canonicalField);
    if (oldMapping && oldMapping.provider_field !== newMapping.provider_field) {
      changes.push({
        canonical_field: canonicalField,
        old_provider_field: oldMapping.provider_field,
        new_provider_field: newMapping.provider_field,
      });
    }
  }

  return changes;
}
