/**
 * @synapse-router/lock — Schema Lock 机制
 *
 * 确保 negotiate 结果可缓存、可复用、版本连续。
 * 类似 package-lock.json：一旦锁定，Schema 不再变化。
 */

export type {
  SchemaLock,
  SchemaLockField,
  SchemaLockFieldMapping,
  SchemaLockConnection,
  OutdatedLockInfo,
} from "./lock.js";

export type {
  MigrationResult,
  MigrationBreakingChange,
  MigrationFieldMappingChange,
} from "./migrate.js";

export {
  getOrCreateLock,
  buildLockFromProviderCard,
  computeCacheKey,
  generateLockId,
  findMatchingFeature,
  detectOutdatedLocks,
} from "./lock.js";

export { LockStorage } from "./storage.js";

export { migrateLock } from "./migrate.js";
