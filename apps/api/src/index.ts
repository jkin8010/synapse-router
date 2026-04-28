import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createVault } from "@synapse-router/vault";
import {
  negotiateSchema,
  type NegotiateSchemaInput,
} from "@synapse-router/negotiator";
import type {
  ProviderCard,
  AgentSchema,
  ProviderFeature,
  FieldMapping,
} from "@synapse-router/core";

// Derive __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Repo root is 3 levels up from apps/api/src/
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

// ─── Types ───────────────────────────────────────────────────────────────────

interface NegotiateBody {
  agent_schema?: AgentSchema;
  provider_id?: string;
}

interface ExecuteBody {
  negotiation_id?: string;
  provider_id?: string;
  feature_id?: string;
  input?: Record<string, unknown>;
}

interface VaultSetKeyBody {
  provider: string;
  key: string;
  auth_type: "APIKey" | "Bearer" | "OAuth2";
}

interface RouteContext {
  providers: Map<string, ProviderCard>;
  vault: ReturnType<typeof createVault>;
  negotiations: Map<string, NegotiationRecord>;
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
      // Guard against very large bodies
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
  details: Record<string, unknown> = {}
): void {
  sendJson(res, statusCode, { error: { code, message, details } });
}

// ─── Provider Loading ────────────────────────────────────────────────────────

async function loadProviders(packsDir: string): Promise<Map<string, ProviderCard>> {
  const providers = new Map<string, ProviderCard>();

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(packsDir, { withFileTypes: true });
  } catch {
    return providers;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const cardPath = path.join(packsDir, entry.name, "provider-card.json");
      const content = await fs.promises.readFile(cardPath, "utf8");
      const card = JSON.parse(content) as ProviderCard;
      providers.set(card.provider.id, card);
    } catch {
      // Skip invalid packs
    }
  }

  return providers;
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
  providers: Map<string, ProviderCard>,
  targetProviderId?: string
): NegotiationRecord {
  const negotiation_id = randomUUID();
  const accepted: AcceptedMatch[] = [];
  const rejected: RejectedMatch[] = [];

  const candidates = targetProviderId
    ? (providers.has(targetProviderId) ? [[targetProviderId, providers.get(targetProviderId)!]] as [string, ProviderCard][] : [])
    : [...providers.entries()];

  for (const [providerId, card] of candidates) {
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
          version: card.provider.version,
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
  ctx: RouteContext
): Promise<void> {
  setCorsHeaders(res);

  // Handle CORS preflight
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
      sendJson(res, 200, { status: "ok" });
      return;
    }

    // ── GET /providers ──────────────────────────────────────────────────────
    if (req.method === "GET" && matchRoute("/providers", pathname)) {
      const cards = [...ctx.providers.values()].map((card) => ({
        provider: card.provider,
        features: card.features.map((f) => ({
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
      const card = ctx.providers.get(providerParams["id"]);
      if (!card) {
        sendError(res, 404, "PROVIDER_NOT_FOUND", `Provider '${providerParams["id"]}' not found`);
        return;
      }
      sendJson(res, 200, card);
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

      const record = negotiate(
        body.agent_schema,
        ctx.providers,
        body.provider_id
      );
      ctx.negotiations.set(record.negotiation_id, record);
      sendJson(res, 200, record);
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

      const card = ctx.providers.get(providerId);
      if (!card) {
        sendError(res, 404, "PROVIDER_NOT_FOUND", `Provider '${providerId}' not found`);
        return;
      }

      const startMs = Date.now();

      // Fetch the API key from vault
      const apiKey = await ctx.vault.getKey(providerId);

      // Execute against provider — mocked response using provider info
      const matchedFeature = card.features.find((f) => f.id === featureId) ?? card.features[0];

      const output = {
        provider_id: providerId,
        feature_id: matchedFeature.id,
        request: body.input ?? {},
        api_key_present: apiKey !== null,
        // In production this would be the actual provider API response
        // For now, return a structured mock that reflects the request was processed
        _meta: {
          provider_base_url: card.provider.base_url,
          auth_type: card.provider.auth_type,
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
    // Distinguish JSON parse errors from internal errors
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
}

/**
 * Returns a promise that resolves when the server has finished loading
 * providers. Attach to server as `._readyPromise` for test access.
 */

export function createServer(options: ServerOptions = {}): http.Server {
  const vaultDir = options.vaultDir ?? path.join(REPO_ROOT, ".vault");
  const packsDir = options.packsDir ?? path.join(REPO_ROOT, "packs");

  const vault = createVault({ vaultDir, audit: false, preferKeychain: false });
  const providers = new Map<string, ProviderCard>();
  const negotiations = new Map<string, NegotiationRecord>();

  const ctx: RouteContext = { providers, vault, negotiations };

  // Load providers before server is considered ready
  let providersReady: Promise<void>;
  providersReady = loadProviders(packsDir)
    .then((loaded) => {
      for (const [id, card] of loaded) {
        providers.set(id, card);
      }
    })
    .catch(() => {
      // Non-fatal: server starts without providers
    });

  ctx.providers = providers;

  const server = http.createServer(async (req, res) => {
    // Wait for providers to be loaded before handling
    await providersReady;
    handleRequest(req, res, ctx).catch((err) => {
      const message = err instanceof Error ? err.message : "Unhandled error";
      sendError(res, 500, "INTERNAL_ERROR", message);
    });
  });

  // Attach for test access
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
