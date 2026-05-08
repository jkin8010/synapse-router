import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { createVault } from "@synapse-router/vault";
import {
  negotiateAndVerify,
  type NegotiateAndVerifyInput,
  type NegotiationResult,
} from "@synapse-router/negotiator";
import {
  createRegistryClient,
} from "@synapse-router/registry-client";
import type {
  RegistryClient,
  RegistryHealth,
} from "@synapse-router/registry-client";
import type {
  ProviderCard,
  AgentSchema,
  ProviderFeature,
  FieldMapping,
} from "@synapse-router/core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

// ─── Types ───────────────────────────────────────────────────────────────────

interface NegotiateBody {
  agent_schema?: AgentSchema;
  provider_id?: string;
  // Schema negotiation fields for negotiateAndVerify
  task?: string;
  goal?: string;
  constraints?: Record<string, unknown>;
  pack_dir?: string;
  base_url?: string;
}

interface ExecuteBody {
  negotiation_id?: string;
  provider_id?: string;
  feature_id?: string;
  input?: Record<string, unknown>;
  base_url?: string;
}

interface VaultSetKeyBody {
  provider: string;
  key: string;
  auth_type: "APIKey" | "Bearer" | "OAuth2";
}

type ProviderSource = "builtin" | "registry" | "local";

interface ProviderEntry {
  card: ProviderCard;
  source: ProviderSource;
}

interface RouteContext {
  providers: Map<string, ProviderEntry>;
  vault: ReturnType<typeof createVault>;
  negotiations: Map<string, NegotiationRecord>;
  registryClient: RegistryClient | null;
}

interface NegotiationRecord {
  negotiation_id: string;
  accepted: AcceptedMatch[];
  rejected: RejectedMatch[];
  created_at: string;
}

interface AcceptedMatch {
  provider_id: string;
  feature: ProviderFeature;
  schema_mapping: {
    id: string;
    capability_id: string;
    provider_id: string;
    version: string;
    fields: FieldMapping[];
    reverse_fields: FieldMapping[];
  };
}

interface RejectedMatch {
  provider_id: string;
  reasons: string[];
}

// ─── Route Matching ───────────────────────────────────────────────────────────

function matchRoute(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split("/");
  const pathParts = pathname.split("/");

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    const a = pathParts[i];

    if (p.startsWith(":")) {
      params[p.slice(1)] = a;
    } else if (p !== a) {
      return null;
    }
  }

  return params;
}

function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (body.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

// ─── Response Helpers ─────────────────────────────────────────────────────────

function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendError(
  res: http.ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): void {
  sendJson(res, statusCode, { error: { code, message, details } });
}

// ─── Provider Loading ────────────────────────────────────────────────────────

async function loadProvidersFromDir(dir: string): Promise<ProviderCard[]> {
  const cards: ProviderCard[] = [];

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return cards;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      let cardPath = path.join(dir, entry.name, "provider-card.json");
      try {
        await fs.promises.stat(cardPath);
      } catch {
        cardPath = path.join(dir, entry.name, "pack.json");
      }
      const content = await fs.promises.readFile(cardPath, "utf8");
      const card = JSON.parse(content) as ProviderCard;
      if (card.provider?.id) {
        cards.push(card);
      }
    } catch {
      // Skip invalid packs
    }
  }

  return cards;
}

async function loadAllProviders(opts: {
  builtinDir: string;
  registryDir: string;
  localDir: string;
}): Promise<{
  providers: Map<string, ProviderEntry>;
  sourceCounts: Record<ProviderSource, number>;
}> {
  const providers = new Map<string, ProviderEntry>();
  const sourceCounts: Record<ProviderSource, number> = {
    builtin: 0,
    registry: 0,
    local: 0,
  };

  // Priority: low to high — local > registry > builtin

  const builtinCards = await loadProvidersFromDir(opts.builtinDir);
  for (const card of builtinCards) {
    providers.set(card.provider.id, { card, source: "builtin" });
  }

  const registryCards = await loadProvidersFromDir(opts.registryDir);
  for (const card of registryCards) {
    providers.set(card.provider.id, { card, source: "registry" });
  }

  const localCards = await loadProvidersFromDir(opts.localDir);
  for (const card of localCards) {
    providers.set(card.provider.id, { card, source: "local" });
  }

  for (const entry of providers.values()) {
    sourceCounts[entry.source]++;
  }

  return { providers, sourceCounts };
}

// ─── Negotiation Logic ───────────────────────────────────────────────────────

function intentMatches(agentIntent: string, featureIntent: string): boolean {
  const normalized = (s: string) => s.toLowerCase().replace(/[_-]/g, "");
  return (
    normalized(agentIntent).includes(normalized(featureIntent)) ||
    normalized(featureIntent).includes(normalized(agentIntent))
  );
}

function negotiate(
  agentSchema: AgentSchema,
  providers: Map<string, ProviderEntry>,
  targetProviderId?: string,
): NegotiationRecord {
  const negotiation_id = randomUUID();
  const accepted: AcceptedMatch[] = [];
  const rejected: RejectedMatch[] = [];

  let candidates: [string, ProviderEntry][];
  if (targetProviderId) {
    const entry = providers.get(targetProviderId);
    candidates = entry ? [[targetProviderId, entry]] : [];
  } else {
    candidates = [...providers.entries()];
  }

  for (const [providerId, entry] of candidates) {
    const card = entry.card;
    let bestMatch: { feature: ProviderFeature; mapping: FieldMapping[] } | null = null;

    for (const feature of card.features) {
      for (const agentFeature of agentSchema.features) {
        if (intentMatches(agentFeature.intent, feature.intent)) {
          if (
            !bestMatch ||
            (feature.field_mappings?.length ?? 0) > (bestMatch.mapping.length ?? 0)
          ) {
            bestMatch = { feature, mapping: feature.field_mappings ?? [] };
          }
        }
      }
    }

    if (bestMatch) {
      accepted.push({
        provider_id: providerId,
        feature: bestMatch.feature,
        schema_mapping: {
          id: randomUUID(),
          capability_id: bestMatch.feature.id,
          provider_id: providerId,
          version: card.service.version,
          fields: bestMatch.mapping,
          reverse_fields: bestMatch.mapping.map((m) => ({
            provider_field: m.canonical_field,
            canonical_field: m.provider_field,
            transform: m.transform,
            required: m.required,
            fallback: m.fallback,
          })),
        },
      });
    } else {
      rejected.push({
        provider_id: providerId,
        reasons: ["intent mismatch"],
      });
    }
  }

  return { negotiation_id, accepted, rejected, created_at: new Date().toISOString() };
}

// ─── Request Handler ──────────────────────────────────────────────────────────

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url ?? "/";
  const [pathname] = url.split("?");

  try {
    // ── GET /health ──────────────────────────────────────────────────────────
    if (req.method === "GET" && matchRoute("/health", pathname)) {
      const sourceCounts: Record<ProviderSource, number> = { builtin: 0, registry: 0, local: 0 };
      for (const entry of ctx.providers.values()) {
        sourceCounts[entry.source]++;
      }

      let registry: { url: string; status: string; latency_ms: number } | null = null;
      if (ctx.registryClient) {
        const health = await ctx.registryClient.healthCheck();
        registry = {
          url: ctx.registryClient.registryUrl,
          status: health.status,
          latency_ms: health.latencyMs,
        };
      }

      sendJson(res, 200, {
        status: "ok",
        version: "0.1.0",
        registry,
        providers: {
          total: ctx.providers.size,
          sources: sourceCounts,
        },
      });
      return;
    }

    // ── GET /providers ──────────────────────────────────────────────────────
    if (req.method === "GET" && matchRoute("/providers", pathname)) {
      const cards = [...ctx.providers.values()].map((entry) => ({
        provider: entry.card.provider,
        source: entry.source,
        service: {
          id: entry.card.service.id,
          name: entry.card.service.name,
          base_url: entry.card.service.base_url,
          auth_type: entry.card.service.auth_type,
        },
        features: entry.card.features.map((f) => ({
          id: f.id,
          intent: f.intent,
          name: f.name,
          description: f.description,
        })),
      }));
      sendJson(res, 200, cards);
      return;
    }

    // ── GET /providers/:id ─────────────────────────────────────────────────
    const providerParams = matchRoute("/providers/:id", pathname);
    if (req.method === "GET" && providerParams) {
      const entry = ctx.providers.get(providerParams["id"]);
      if (!entry) {
        sendError(res, 404, "PROVIDER_NOT_FOUND", `Provider '${providerParams["id"]}' not found`);
        return;
      }
      sendJson(res, 200, { ...entry.card, source: entry.source });
      return;
    }

    // ── GET /vault/keys ─────────────────────────────────────────────────────
    if (req.method === "GET" && matchRoute("/vault/keys", pathname)) {
      const keys = await ctx.vault.listKeys();
      sendJson(res, 200, { keys });
      return;
    }

    // ── POST /vault/keys ───────────────────────────────────────────────────
    if (req.method === "POST" && matchRoute("/vault/keys", pathname)) {
      const body = (await parseBody(req)) as VaultSetKeyBody;
      if (!body.provider || !body.key || !body.auth_type) {
        sendError(res, 400, "INVALID_REQUEST", "provider, key, and auth_type are required");
        return;
      }
      await ctx.vault.setKey(body.provider, body.key, body.auth_type);
      sendJson(res, 201, { stored: true, provider: body.provider });
      return;
    }

    // ── DELETE /vault/keys/:provider ────────────────────────────────────────
    const vaultDeleteParams = matchRoute("/vault/keys/:provider", pathname);
    if (req.method === "DELETE" && vaultDeleteParams) {
      const removed = await ctx.vault.removeKey(vaultDeleteParams["provider"]);
      if (!removed) {
        sendError(res, 404, "KEY_NOT_FOUND", `No key found for provider '${vaultDeleteParams["provider"]}'`);
        return;
      }
      sendJson(res, 200, { removed: true, provider: vaultDeleteParams["provider"] });
      return;
    }

    // ── POST /vault/verify/:provider ───────────────────────────────────────
    const vaultVerifyParams = matchRoute("/vault/verify/:provider", pathname);
    if (req.method === "POST" && vaultVerifyParams) {
      const provider = vaultVerifyParams["provider"];
      const valid = await ctx.vault.verifyKey(provider);
      sendJson(res, 200, { provider, valid });
      return;
    }

    // ── POST /negotiate ─────────────────────────────────────────────────────
    if (req.method === "POST" && matchRoute("/negotiate", pathname)) {
      const body = (await parseBody(req)) as NegotiateBody;

      if (!body.agent_schema) {
        sendError(res, 400, "INVALID_REQUEST", "agent_schema is required");
        return;
      }

      if (!Array.isArray(body.agent_schema.features) || body.agent_schema.features.length === 0) {
        sendError(res, 400, "INVALID_REQUEST", "agent_schema.features must be a non-empty array");
        return;
      }

      const record = negotiate(body.agent_schema, ctx.providers, body.provider_id);
      ctx.negotiations.set(record.negotiation_id, record);

      // Run schema-level negotiation + verification when task/goal provided
      let verification_result: NegotiationResult["verification_result"] | undefined;
      if (body.task && body.goal && body.provider_id) {
        try {
          const packDir = body.pack_dir ?? path.join(REPO_ROOT, "packs", body.provider_id);
          const result = await negotiateAndVerify({
            task: body.task,
            goal: body.goal,
            constraints: body.constraints ?? {},
            providerId: body.provider_id,
            packDir,
          });
          verification_result = result.verification_result;
        } catch (err) {
          verification_result = {
            status: err instanceof Error && err.message.includes("mock_failure")
              ? "mock_failure"
              : err instanceof Error && err.message.includes("manifest_mismatch")
              ? "manifest_mismatch"
              : "mock_failure",
            verified_at: new Date().toISOString(),
          };
        }
      }

      sendJson(res, 200, {
        ...record,
        verification_result,
        ...(body.base_url ? { provider_base_url_override: body.base_url } : {}),
      });
      return;
    }

    // ── POST /execute ───────────────────────────────────────────────────────
    if (req.method === "POST" && matchRoute("/execute", pathname)) {
      const body = (await parseBody(req)) as ExecuteBody;

      let providerId: string;
      let featureId: string;
      let negotiationRecord: NegotiationRecord | undefined;

      if (body.negotiation_id) {
        negotiationRecord = ctx.negotiations.get(body.negotiation_id);
        if (!negotiationRecord) {
          sendError(res, 404, "NEGOTIATION_NOT_FOUND", `Negotiation '${body.negotiation_id}' not found or expired`);
          return;
        }
        if (negotiationRecord.accepted.length === 0) {
          sendError(res, 400, "NO_ACCEPTED_PROVIDERS", "Negotiation has no accepted providers");
          return;
        }
        providerId = negotiationRecord.accepted[0].provider_id;
        featureId = negotiationRecord.accepted[0].feature.id;
      } else if (body.provider_id) {
        providerId = body.provider_id;
        featureId = body.feature_id ?? "";
      } else {
        sendError(res, 400, "INVALID_REQUEST", "Either negotiation_id or provider_id is required");
        return;
      }

      const entry = ctx.providers.get(providerId);
      if (!entry) {
        sendError(res, 404, "PROVIDER_NOT_FOUND", `Provider '${providerId}' not found`);
        return;
      }

      const startMs = Date.now();
      const apiKey = await ctx.vault.getKey(providerId);
      const matchedFeature = entry.card.features.find((f) => f.id === featureId) ?? entry.card.features[0];

      const output = {
        provider_id: providerId,
        feature_id: matchedFeature.id,
        request: body.input ?? {},
        api_key_present: apiKey !== null,
        _meta: {
          provider_base_url: body.base_url ?? entry.card.service.base_url,
          auth_type: entry.card.service.auth_type,
          feature_intent: matchedFeature.intent,
        },
      };

      sendJson(res, 200, {
        output,
        provider_id: providerId,
        latency_ms: Date.now() - startMs,
      });
      return;
    }

    // ── 404 ─────────────────────────────────────────────────────────────────
    sendError(res, 404, "NOT_FOUND", `Route '${pathname}' not found`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message === "Invalid JSON") {
      sendError(res, 400, "INVALID_REQUEST", "Invalid JSON in request body");
    } else {
      sendError(res, 500, "INTERNAL_ERROR", message);
    }
  }
}

// ─── Server Factory ──────────────────────────────────────────────────────────

export interface ServerOptions {
  vaultDir?: string;
  packsDir?: string;
  port?: number;
  hostname?: string;
  noRegistry?: boolean;
}

export function createServer(options: ServerOptions = {}): http.Server {
  const vaultDir = options.vaultDir ?? path.join(REPO_ROOT, ".vault");
  const packsDir = options.packsDir ?? path.join(REPO_ROOT, "packs");
  const registryDir = path.join(homedir(), ".synapse", "packs");
  const localDir = path.join(process.cwd(), "synapse-packs");

  const vault = createVault({ vaultDir, audit: false, preferKeychain: false });
  const providers = new Map<string, ProviderEntry>();
  const negotiations = new Map<string, NegotiationRecord>();
  const registryClient = options.noRegistry ? null : createRegistryClient();

  const ctx: RouteContext = { providers, vault, negotiations, registryClient };

  const providersReady = loadAllProviders({ builtinDir: packsDir, registryDir, localDir })
    .then((result) => {
      for (const [id, entry] of result.providers) {
        providers.set(id, entry);
      }
    })
    .catch(() => {
      // Non-fatal: server starts without providers
    });

  const server = http.createServer(async (req, res) => {
    await providersReady;
    handleRequest(req, res, ctx).catch((err) => {
      const message = err instanceof Error ? err.message : "Unhandled error";
      sendError(res, 500, "INTERNAL_ERROR", message);
    });
  });

  (server as any)._providers = providers;
  (server as any)._vault = vault;
  (server as any)._negotiations = negotiations;
  (server as any)._readyPromise = providersReady;

  return server;
}

export async function startServer(options: ServerOptions = {}): Promise<http.Server> {
  const server = createServer(options);
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  const hostname = options.hostname ?? "0.0.0.0";

  return new Promise((resolve, reject) => {
    server.listen(port, hostname, () => {
      console.log(`Server listening on http://${hostname}:${port}`);
      resolve(server);
    });
    server.on("error", reject);
  });
}

// ─── CLI Entry Point ─────────────────────────────────────────────────────────

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
