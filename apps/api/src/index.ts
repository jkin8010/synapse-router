import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { createVault } from "@synapse-router/vault";
import {
  intentsMatch,
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
import { generateSdk } from "@synapse-router/sdk-generator";

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

interface SdkPreviewBody {
  agent_schema?: { features?: Array<{ intent?: string }> };
  provider_id?: string;
  lang?: "typescript" | "python";
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

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Decode each path segment once, up front, so route params (`:id`,
 * `:provider`) never leak percent-encoded characters into downstream lookups.
 */
function decodePathname(pathname: string): string {
  return pathname
    .split("/")
    .map((segment, index) => (index === 0 ? segment : safeDecode(segment)))
    .join("/");
}

function matchRoute(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split("/");
  const pathParts = pathname.split("/");

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    const a = pathParts[i];

    if (p.startsWith(":")) {
      // An empty segment is not a valid parameter value
      if (a === undefined || a.length === 0) return null;
      params[p.slice(1)] = a;
    } else if (p !== a) {
      return null;
    }
  }

  return params;
}

// ─── Vault route guard ──────────────────────────────────────────────────────

interface AuthFailure {
  status: number;
  code: string;
  message: string;
}

/**
 * Vault routes hold secrets, so they are gated independently of the public API:
 *   - cross-site origins are rejected outright (browsers always send Origin on
 *     cross-origin reads, so this blocks CSRF / malicious pages);
 *   - when API_TOKEN / SYNAPSE_API_TOKEN is configured, a matching
 *     `Authorization: Bearer <token>` is required.
 */
function authorizeVaultRequest(
  req: http.IncomingMessage,
  origin: string | undefined,
): AuthFailure | null {
  if (origin !== undefined && !isAllowedOrigin(origin)) {
    return {
      status: 403,
      code: "ORIGIN_NOT_ALLOWED",
      message: `Origin '${origin}' is not allowed to access vault endpoints`,
    };
  }

  const token = process.env.API_TOKEN ?? process.env.SYNAPSE_API_TOKEN;
  if (token === undefined || token.trim().length === 0) {
    return null;
  }

  const header = req.headers.authorization;
  const expected = `Bearer ${token}`;
  if (header !== expected) {
    return {
      status: 401,
      code: "UNAUTHORIZED",
      message: "A valid bearer token is required for vault endpoints",
    };
  }

  return null;
}

const MAX_BODY_BYTES = 1_000_000;

function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // Reject early on declared size, before buffering anything
    const contentLength = Number(req.headers["content-length"] ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      reject(new Error("Request body too large"));
      req.resume();
      return;
    }

    let body = "";
    let settled = false;

    req.on("data", (chunk) => {
      // Stop accumulating once the limit has been hit — do not keep growing
      // the buffer while the request is being torn down.
      if (settled) return;
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        settled = true;
        body = "";
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
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
    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

// ─── Response Helpers ─────────────────────────────────────────────────────────

/**
 * CORS origin allow-list (`ALLOWED_ORIGINS`, comma separated), read once.
 *
 * - allow-list configured → only those origins get an echoed `ACAO`;
 * - no allow-list → same-machine (loopback) origins are trusted, and requests
 *   without an `Origin` header (curl, server-to-server) keep the historical
 *   `ACAO: *` so non-browser clients are unaffected.
 *
 * Vault routes additionally reject any origin that is not allowed, so a random
 * web page can never read or mutate stored keys.
 */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function isAllowedOrigin(origin: string | undefined): boolean {
  if (origin === undefined) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // No allow-list configured → only same-machine origins (the local dev
  // setup) are trusted; any remote site stays outside the CORS boundary.
  return ALLOWED_ORIGINS.length === 0 && LOOPBACK_ORIGIN.test(origin);
}

function setCorsHeaders(res: http.ServerResponse, origin?: string): void {
  // Never echo `*` when a specific origin was allowed: browsers treat the pair
  // (`ACAO: *` + cookies) as a security hole and the wildcard would also let
  // any site read vault metadata.
  if (origin !== undefined && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else if (origin === undefined && ALLOWED_ORIGINS.length === 0) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
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

interface ProviderLoadFailure {
  dir: string;
  pack: string;
  reason: "missing" | "invalid" | "read_error";
  message: string;
}

async function loadProvidersFromDir(
  dir: string,
  failures: ProviderLoadFailure[] = [],
): Promise<ProviderCard[]> {
  const cards: ProviderCard[] = [];

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (err) {
    // A missing directory is expected (e.g. no local packs); anything else is
    // worth surfacing so a broken deployment is not mistaken for "0 packs".
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") {
      failures.push({
        dir,
        pack: "",
        reason: "read_error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return cards;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    let cardPath = path.join(dir, entry.name, "provider-card.json");
    try {
      await fs.promises.stat(cardPath);
    } catch {
      cardPath = path.join(dir, entry.name, "pack.json");
    }

    let content: string;
    try {
      content = await fs.promises.readFile(cardPath, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      failures.push({
        dir,
        pack: entry.name,
        reason: code === "ENOENT" ? "missing" : "read_error",
        message: code === "ENOENT"
          ? "neither provider-card.json nor pack.json found"
          : err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    let card: ProviderCard;
    try {
      card = JSON.parse(content) as ProviderCard;
    } catch (err) {
      failures.push({
        dir,
        pack: entry.name,
        reason: "invalid",
        message: `invalid JSON in ${path.basename(cardPath)}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
      continue;
    }

    if (!card.provider?.id) {
      failures.push({
        dir,
        pack: entry.name,
        reason: "invalid",
        message: "provider.id is missing",
      });
      continue;
    }

    cards.push(card);
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
  failures: ProviderLoadFailure[];
}> {
  const providers = new Map<string, ProviderEntry>();
  const sourceCounts: Record<ProviderSource, number> = {
    builtin: 0,
    registry: 0,
    local: 0,
  };

  // Priority: low to high — local > registry > builtin

  const failures: ProviderLoadFailure[] = [];

  const builtinCards = await loadProvidersFromDir(opts.builtinDir, failures);
  for (const card of builtinCards) {
    providers.set(card.provider.id, { card, source: "builtin" });
  }

  const registryCards = await loadProvidersFromDir(opts.registryDir, failures);
  for (const card of registryCards) {
    providers.set(card.provider.id, { card, source: "registry" });
  }

  const localCards = await loadProvidersFromDir(opts.localDir, failures);
  for (const card of localCards) {
    providers.set(card.provider.id, { card, source: "local" });
  }

  for (const entry of providers.values()) {
    sourceCounts[entry.source]++;
  }

  return { providers, sourceCounts, failures };
}

// ─── Negotiation Logic ───────────────────────────────────────────────────────

/**
 * Build the API-level negotiation record for an agent schema.
 *
 * Only request/response adaptation lives here: intent matching is delegated to
 * @synapse-router/negotiator (`intentsMatch`) so API and package behaviour stay
 * identical when the negotiation rules change.
 */
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
        if (intentsMatch(agentFeature.intent, feature.intent)) {
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
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  setCorsHeaders(res, origin);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url ?? "/";
  const [rawPathname] = url.split("?");
  const pathname = decodePathname(rawPathname);

  // ── Vault routes are not public API ─────────────────────────────────────
  // Secret management must never be reachable from a browser page: require a
  // bearer token whenever one is configured, and reject requests whose Origin
  // is not on the allow-list (CSRF / cross-site reads).
  if (pathname.startsWith("/vault/") || pathname === "/vault") {
    const authError = authorizeVaultRequest(req, origin);
    if (authError !== null) {
      sendError(res, authError.status, authError.code, authError.message);
      return;
    }
  }

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

    // ── POST /sdk-preview ───────────────────────────────────────────────────
    if (req.method === "POST" && matchRoute("/sdk-preview", pathname)) {
      const body = (await parseBody(req)) as SdkPreviewBody;

      if (!body.provider_id) {
        sendError(res, 400, "INVALID_REQUEST", "provider_id is required");
        return;
      }
      if (!body.agent_schema || !Array.isArray(body.agent_schema.features) || body.agent_schema.features.length === 0) {
        sendError(res, 400, "INVALID_REQUEST", "agent_schema.features must be a non-empty array");
        return;
      }

      const lang = body.lang === "python" ? "python" : "typescript";
      const packDir = path.join(REPO_ROOT, "packs", body.provider_id);

      try {
        await fs.promises.access(packDir);
      } catch {
        sendError(res, 404, "PACK_NOT_FOUND", "Pack not found");
        return;
      }

      try {
        const result = await generateSdk({
          packDir,
          lang,
          outputDir: "/tmp/synapse-sdk-preview",
          withBilling: false,
        });

        const mainFile = result.files.find(f =>
          f.path.endsWith("index.ts") || f.path.endsWith("client.ts") ||
          f.path.endsWith("index.py") || f.path.endsWith("client.py")
        );
        const code = mainFile?.content ?? result.files.map(f => `// ${f.path}\n${f.content}`).join("\n\n");

        sendJson(res, 200, { code, lang: result.lang, provider: result.provider, features: result.features });
      } catch (err) {
        const message = err instanceof Error ? err.message : "SDK generation failed";
        sendError(res, 500, "SDK_GENERATION_FAILED", message);
      }
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
      // Loading a pack must never crash the server, but it must not be silent
      // either — without these records a broken pack only shows up as a lower
      // provider count.
      for (const failure of result.failures) {
        console.warn(
          `[api] skipped provider pack '${failure.pack || "<dir>"}' in ${failure.dir} (${failure.reason}): ${failure.message}`,
        );
      }
    })
    .catch((err) => {
      console.warn(
        `[api] provider loading failed: ${err instanceof Error ? err.message : String(err)}`,
      );
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
