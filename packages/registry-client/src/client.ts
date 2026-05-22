// ─── Registry API Client ───────────────────────────────────────────────────────
// Zero framework dependencies — uses native fetch (Node 18+).

import type {
  RegistryClientConfig,
  SearchOptions,
  SearchResult,
  PackInfo,
  PackDetail,
  ListPacksResult,
  PackVersion,
  DownloadInfo,
  RegistryHealth,
} from "./types.js";

const DEFAULT_REGISTRY_URL = "https://registry.synrc.io";
const DEFAULT_TIMEOUT = 10000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveConfig(config?: RegistryClientConfig): Required<RegistryClientConfig> {
  return {
    registryUrl:
      config?.registryUrl ??
      process.env["SYNAPSE_REGISTRY_URL"] ??
      DEFAULT_REGISTRY_URL,
    timeout: config?.timeout ?? DEFAULT_TIMEOUT,
    authToken: config?.authToken ?? process.env["SYNAPSE_REGISTRY_TOKEN"] ?? "",
  };
}

async function apiGet<T>(
  path: string,
  config: Required<RegistryClientConfig>,
): Promise<T> {
  const url = `${config.registryUrl}${path}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.authToken) {
    headers["Authorization"] = `Bearer ${config.authToken}`;
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(config.timeout),
  });

  if (!response.ok) {
    let errorBody: { error?: { code?: string; message?: string } } | null = null;
    try {
      errorBody = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
    } catch {
      // ignore parse errors on error responses
    }
    const message =
      errorBody?.error?.message ?? `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(`Registry API error: ${message}`);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// RegistryClient
// ---------------------------------------------------------------------------

export class RegistryClient {
  private config: Required<RegistryClientConfig>;

  constructor(config?: RegistryClientConfig) {
    this.config = resolveConfig(config);
  }

  get registryUrl(): string {
    return this.config.registryUrl;
  }

  // ── Search ────────────────────────────────────────────────────────────────

  async searchPacks(query: string, opts?: SearchOptions): Promise<SearchResult> {
    const params = new URLSearchParams({ q: query, type: "pack" });
    if (opts?.category) params.set("category", opts.category);

    const raw = await apiGet<{
      results: { packs: Array<{
        namespace: string; name: string; displayName: string;
        description?: string; version: string;
      }> };
      total: number;
    }>(`/api/v1/search?${params.toString()}`, this.config);

    const results: PackInfo[] = (raw.results?.packs ?? []).map((p) => ({
      id: `${p.namespace}/${p.name}`,
      ns: p.namespace,
      name: p.name,
      version: p.version,
      description: p.description ?? "",
    }));

    return { query, results, total: raw.total ?? results.length };
  }

  // ── List all packs ─────────────────────────────────────────────────────────

  async listPacks(page = 1, limit = 50): Promise<ListPacksResult> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    const raw = await apiGet<{
      data: Array<{
        namespace: string; name: string; displayName: string;
        description?: string; version: string; category?: string;
        provider: string; downloads: number; rating: number;
        tags: string[]; createdAt: string; updatedAt: string;
      }>;
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/api/v1/packs?${params.toString()}`, this.config);

    return {
      packs: (raw.data ?? []).map((p) => ({
        id: `${p.namespace}/${p.name}`,
        ns: p.namespace,
        name: p.name,
        displayName: p.displayName,
        description: p.description ?? "",
        version: p.version,
        category: p.category ?? "",
        provider: p.provider,
        downloads: p.downloads,
        rating: p.rating,
        tags: p.tags ?? [],
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      pagination: raw.pagination,
    };
  }

  // ── Pack detail ───────────────────────────────────────────────────────────

  async getPack(ns: string, name: string): Promise<PackDetail> {
    const raw = await apiGet<{
      namespace: string; name: string; displayName: string;
      description?: string; version: string;
      provider: string; category?: string; downloads: number; rating: number;
      tags: string[]; verified: boolean; license: string; repository: string;
      author: { id: string; name: string };
      versions: Array<{
        version: string; deleted: boolean; publishedAt: string;
        changelog: string; downloads: number;
      }>;
      totalVersions: number; activeVersions: number;
      readme: string; guide: string; spec: Record<string, unknown>;
    }>(`/api/v1/packs/${ns}/${name}`, this.config);

    return {
      id: `${raw.namespace}/${raw.name}`,
      ns: raw.namespace,
      name: raw.name,
      description: raw.description ?? "",
      version: raw.version,
      displayName: raw.displayName,
      provider: raw.provider,
      category: raw.category,
      downloads: raw.downloads,
      rating: raw.rating,
      tags: raw.tags ?? [],
      verified: raw.verified,
      license: raw.license,
      repository: raw.repository,
      author: raw.author,
      versions: (raw.versions ?? []).map((v) => ({
        version: v.version,
        deleted: v.deleted ?? false,
        publishedAt: v.publishedAt,
        changelog: v.changelog,
        downloads: v.downloads,
      })),
      totalVersions: raw.totalVersions,
      activeVersions: raw.activeVersions,
      readme: raw.readme,
      guide: raw.guide,
      spec: raw.spec,
    };
  }

  // ── Pack versions ─────────────────────────────────────────────────────────

  async getPackVersions(_ns: string, _name: string): Promise<PackVersion[]> {
    // Registry API returns versions inline in getPack response.
    // For standalone version list, we call getPack and extract.
    const detail = await this.getPack(_ns, _name);
    return detail.versions.map((v) => ({
      version: v.version,
      coreMinVersion: "0.1.0",
      changelog: v.changelog,
      breaking: v.changelog.toLowerCase().includes("breaking"),
      createdAt: v.publishedAt,
    }));
  }

  // ── Download info ─────────────────────────────────────────────────────────

  async getDownloadInfo(
    ns: string,
    name: string,
    version?: string,
  ): Promise<DownloadInfo> {
    const path = version
      ? `/api/v1/packs/${ns}/${name}/download/${version}`
      : `/api/v1/packs/${ns}/${name}/download`;
    return apiGet<DownloadInfo>(path, this.config);
  }

  // ── Download pack tarball ─────────────────────────────────────────────────

  async downloadPack(
    ns: string,
    name: string,
    version?: string,
  ): Promise<{ buffer: Buffer; version: string; checksum: string }> {
    const info = await this.getDownloadInfo(ns, name, version);

    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers["Authorization"] = `Bearer ${this.config.authToken}`;
    }

    let response: Response;
    try {
      response = await fetch(info.url, {
        headers,
        signal: AbortSignal.timeout(300_000), // 5 min for tarball download
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      throw new Error(
        `Failed to download ${ns}/${name}@${info.version} from ${info.url}: ${message}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Download failed: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return { buffer, version: info.version, checksum: info.hash };
  }

  // ── Health check ──────────────────────────────────────────────────────────

  async healthCheck(): Promise<RegistryHealth> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.config.registryUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return {
        status: response.ok ? "ok" : "degraded",
        url: this.config.registryUrl,
        latencyMs: Date.now() - start,
      };
    } catch (err: unknown) {
      return {
        status: "unavailable",
        url: this.config.registryUrl,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createRegistryClient(
  config?: RegistryClientConfig,
): RegistryClient {
  return new RegistryClient(config);
}
