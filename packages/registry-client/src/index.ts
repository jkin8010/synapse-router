// ─── @synapse-router/registry-client ──────────────────────────────────────────
// Public API surface.

export { RegistryClient, createRegistryClient } from "./client.js";
export {
  installPack,
  removePack,
  listInstalledPacks,
  updatePack,
} from "./installer.js";
export { submitVerification, fetchPackManifest } from "./verify.js";
export type { VerificationSubmission } from "./verify.js";
export type {
  RegistryClientConfig,
  SearchOptions,
  SearchResult,
  PackInfo,
  PackDetail,
  PackVersionSummary,
  PackVersion,
  DownloadInfo,
  PackTarball,
  RegistryHealth,
  ManifestEntry,
  Manifest,
  InstallOptions,
  InstallResult,
  ListPackItem,
  ListPacksResult,
} from "./types.js";
