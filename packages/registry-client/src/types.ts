// ─── Shared types for Registry Client ──────────────────────────────────────────

export interface RegistryClientConfig {
  registryUrl?: string;
  timeout?: number;
  authToken?: string;
}

export interface SearchOptions {
  type?: "pack" | "provider" | "all";
  category?: string;
}

export interface PackInfo {
  id: string;
  ns: string;
  name: string;
  version: string;
  description: string;
}

export interface PackDetail extends PackInfo {
  displayName: string;
  provider: string;
  category?: string;
  downloads: number;
  rating: number;
  tags: string[];
  verified: boolean;
  license: string;
  repository: string;
  author: { id: string; name: string };
  versions: PackVersionSummary[];
  totalVersions: number;
  activeVersions: number;
  readme: string;
  guide: string;
  spec: Record<string, unknown>;
}

export interface PackVersionSummary {
  version: string;
  deleted: boolean;
  publishedAt: string;
  changelog: string;
  downloads: number;
}

export interface PackVersion {
  version: string;
  coreMinVersion: string;
  changelog: string;
  breaking: boolean;
  createdAt: string;
}

export interface SearchResult {
  query: string;
  results: PackInfo[];
  total: number;
}

export interface DownloadInfo {
  url: string;
  version: string;
  size: number;
  hash: string;
}

export interface PackTarball {
  buffer: Buffer;
  version: string;
  checksum: string;
}

export interface RegistryHealth {
  status: "ok" | "degraded" | "unavailable";
  url: string;
  latencyMs: number;
  error?: string;
}

export interface ManifestEntry {
  id: string;
  ns: string;
  name: string;
  version: string;
  installed_at: string;
  source: string;
  checksum: string;
}

export interface Manifest {
  packs: Record<string, ManifestEntry>;
}

export interface InstallOptions {
  force?: boolean;
  version?: string;
  registryUrl?: string;
}

export interface InstallResult {
  success: boolean;
  ns: string;
  name: string;
  version: string;
  source: "registry" | "builtin";
  features?: Array<{ id: string; intent: string; name: string }>;
  error?: string;
}

export interface ListPackItem {
  id: string;
  ns: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  category: string;
  provider: string;
  downloads: number;
  rating: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ListPacksResult {
  packs: ListPackItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
