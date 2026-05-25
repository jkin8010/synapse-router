// @synapse-router/cli — `synapse lock` command
// Manage Schema Locks: list, show, remove, migrate, outdated

import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { HELP_LOCK } from "../utils/help.js";
import {
  getOrCreateLock,
  detectOutdatedLocks,
  migrateLock,
  LockStorage,
  type SchemaLock,
  type SchemaLockField,
  type SchemaLockFieldMapping,
  type OutdatedLockInfo,
} from "@synapse-router/lock";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LockCommandOptions {
  subcommand?: string;
  lockId?: string;
  format?: "json" | "table";
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const SYNAPSE_DIR = join(homedir(), ".synapse");
const SCHEMAS_DIR = join(SYNAPSE_DIR, "schemas");

async function findPacksDir(): Promise<string> {
  const { fileURLToPath } = await import("node:url");
  const dir = fileURLToPath(import.meta.url);
  if (dir.includes("/dist/")) {
    return join(dirname(dirname(dirname(dirname(dirname(dir))))), "packs");
  } else {
    return join(dirname(dirname(dirname(dirname(dir)))), "packs");
  }
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

export function printLockHelp(): void {
  console.log(HELP_LOCK);
}

// ---------------------------------------------------------------------------
// Parse lock command arguments
// ---------------------------------------------------------------------------

export function parseLockArgs(argv: string[]): LockCommandOptions {
  if (argv.includes("--help") || argv.includes("-h")) {
    printLockHelp();
    process.exit(0);
  }

  const options: LockCommandOptions = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--format" && argv[i + 1]) {
      options.format = argv[++i] as "json" | "table";
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  options.subcommand = positional[0];
  options.lockId = positional[1];
  return options;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatLockShort(lock: SchemaLock): string {
  const statusIcon = lock.status === "active" ? "✓" : lock.status === "deprecated" ? "⚠" : "→";
  return `  ${statusIcon} ${lock.lock_id.padEnd(50)} ${lock.intent.padEnd(15)} ${lock.provider.padEnd(12)} v${lock.pack_version}`;
}

function formatLockDetail(lock: SchemaLock): string {
  const lines: string[] = [
    `Lock ID:        ${lock.lock_id}`,
    `Intent:         ${lock.intent}`,
    `Provider:       ${lock.provider}`,
    `Pack Version:   ${lock.pack_version}`,
    `Feature ID:     ${lock.feature_id}`,
    `Status:         ${lock.status}`,
    `Locked At:      ${lock.locked_at}`,
    ``,
    `Input Fields:`,
    ...lock.input_schema.fields.map(
      (f: SchemaLockField) => `  ${f.name.padEnd(20)} ${f.type.padEnd(10)} ${f.required ? "required" : "optional"}`
    ),
    ``,
    `Output Fields:`,
    ...lock.output_schema.fields.map(
      (f: SchemaLockField) => `  ${f.name.padEnd(20)} ${f.type}`
    ),
    ``,
    `Field Mappings:`,
    ...lock.field_mappings.map(
      (fm: SchemaLockFieldMapping) => `  ${fm.canonical_field.padEnd(20)} → ${fm.provider_field}${fm.transform ? ` (${fm.transform})` : ""}${fm.required ? " [required]" : ""}${fm.fallback !== undefined ? ` fallback=${JSON.stringify(fm.fallback)}` : ""}`
    ),
    ``,
    `Connection:`,
    `  Base URL:  ${lock.connection.base_url}`,
    `  Auth Type: ${lock.connection.auth_type}`,
  ];

  if (lock.migrated_to) {
    lines.push(``, `Migrated To:    ${lock.migrated_to}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Sub-commands
// ---------------------------------------------------------------------------

async function lockList(format: "json" | "table"): Promise<void> {
  const storage = new LockStorage(SCHEMAS_DIR);
  const locks = await storage.list();

  if (format === "json") {
    console.log(JSON.stringify(locks, null, 2));
    return;
  }

  if (locks.length === 0) {
    console.log("No Schema Locks found.");
    console.log("Run `synapse negotiate --intent <intent> --provider <provider>` to create one.");
    return;
  }

  console.log("Schema Locks:");
  console.log(`  ${"Lock ID".padEnd(50)} ${"Intent".padEnd(15)} ${"Provider".padEnd(12)} Version`);
  for (const lock of locks) {
    console.log(formatLockShort(lock));
  }
}

async function lockShow(lockId: string, format: "json" | "table"): Promise<void> {
  if (!lockId) {
    console.error("Error: lock-id required");
    console.error("Usage: synapse lock show <lock-id>");
    process.exit(1);
  }

  const storage = new LockStorage(SCHEMAS_DIR);
  const lock = await storage.load(lockId);

  if (!lock) {
    console.error(`Lock not found: ${lockId}`);
    process.exit(1);
  }

  if (format === "json") {
    console.log(JSON.stringify(lock, null, 2));
  } else {
    console.log(formatLockDetail(lock));
  }
}

async function lockRemove(lockId: string): Promise<void> {
  if (!lockId) {
    console.error("Error: lock-id required");
    console.error("Usage: synapse lock remove <lock-id>");
    process.exit(1);
  }

  const storage = new LockStorage(SCHEMAS_DIR);
  const removed = await storage.remove(lockId);

  if (removed) {
    console.log(`✓ Lock removed: ${lockId}`);
    console.log("Next `synapse negotiate` or `synapse connect` will regenerate this lock.");
  } else {
    console.error(`Lock not found: ${lockId}`);
    process.exit(1);
  }
}

async function lockMigrate(lockId: string): Promise<void> {
  if (!lockId) {
    console.error("Error: lock-id required");
    console.error("Usage: synapse lock migrate <lock-id>");
    process.exit(1);
  }

  const storage = new LockStorage(SCHEMAS_DIR);
  const oldLock = await storage.load(lockId);

  if (!oldLock) {
    console.error(`Lock not found: ${lockId}`);
    process.exit(1);
  }

  if (oldLock.status === "deprecated") {
    console.error(`Lock is already deprecated${oldLock.migrated_to ? ` (migrated to: ${oldLock.migrated_to})` : ""}`);
    process.exit(1);
  }

  const packsDir = await findPacksDir();

  try {
    const result = await migrateLock(oldLock, packsDir, SYNAPSE_DIR);

    console.log(`✓ Lock migrated: ${result.old_lock_id} → ${result.new_lock_id}`);

    if (result.breaking_changes.length > 0) {
      console.log("\n⚠ Breaking changes detected:");
      for (const change of result.breaking_changes) {
        console.log(`  ${change.change.padEnd(12)} ${change.field}${change.old_value ? ` (was: ${change.old_value})` : ""}${change.new_value ? ` (now: ${change.new_value})` : ""}`);
      }
    }

    if (result.field_mapping_changes.length > 0) {
      console.log("\nField mapping changes:");
      for (const change of result.field_mapping_changes) {
        console.log(`  ${change.canonical_field}: ${change.old_provider_field} → ${change.new_provider_field}`);
      }
    }

    if (result.breaking_changes.length === 0 && result.field_mapping_changes.length === 0) {
      console.log("No breaking changes or mapping changes detected.");
    }
  } catch (err: any) {
    console.error(`Error migrating lock: ${err.message}`);
    process.exit(1);
  }
}

async function lockOutdated(format: "json" | "table"): Promise<void> {
  const packsDir = await findPacksDir();
  const outdated = await detectOutdatedLocks(SYNAPSE_DIR, packsDir);

  if (format === "json") {
    console.log(JSON.stringify(outdated, null, 2));
    return;
  }

  const outdatedLocks = outdated.filter((o: OutdatedLockInfo) => o.outdated);
  const activeLocks = outdated.filter((o: OutdatedLockInfo) => !o.outdated);

  if (outdated.length === 0) {
    console.log("No Schema Locks found.");
    return;
  }

  if (outdatedLocks.length > 0) {
    console.log("⚠ Outdated Locks (pack version has changed):");
    for (const o of outdatedLocks) {
      console.log(`  ${o.lock.lock_id}  v${o.lock.pack_version} → v${o.current_pack_version}`);
    }
    console.log("\nRun `synapse lock migrate <lock-id>` to update.");
  }

  if (activeLocks.length > 0) {
    console.log(`\n✓ Up-to-date Locks (${activeLocks.length}):`);
    for (const o of activeLocks) {
      console.log(`  ${o.lock.lock_id}  v${o.lock.pack_version}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleLockCommand(argv: string[]): Promise<void> {
  const options = parseLockArgs(argv);
  const format = options.format ?? "table";

  switch (options.subcommand) {
    case "list":
      await lockList(format);
      break;
    case "show":
      await lockShow(options.lockId ?? "", format);
      break;
    case "remove":
      await lockRemove(options.lockId ?? "");
      break;
    case "migrate":
      await lockMigrate(options.lockId ?? "");
      break;
    case "outdated":
      await lockOutdated(format);
      break;
    default:
      if (!options.subcommand) {
        printLockHelp();
      } else {
        console.error(`Unknown lock subcommand: ${options.subcommand}`);
        printLockHelp();
        process.exit(1);
      }
  }
}
