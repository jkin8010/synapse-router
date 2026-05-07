/**
 * @synapse-router/connector — 薄连接层
 *
 * 连接 Schema 契约世界（canonical fields）和 Provider API 世界（provider fields）
 * 唯一职责：映射 + HTTP 调用 + 反向映射
 */

import { mapInput, mapOutput } from "./mapper.js";
import { callProvider, type HttpRequest } from "./http.js";
import { deriveApiPath } from "./path.js";
import type { ConnectLock, ConnectParams, ConnectResult } from "./types.js";

export type { ConnectLock, ConnectParams, ConnectResult } from "./types.js";
export type { HttpRequest } from "./http.js";
export { mapInput, mapOutput } from "./mapper.js";
export { deriveApiPath } from "./path.js";
export { callProvider, ConnectorHttpError } from "./http.js";

// ─── Main Function ──────────────────────────────────────────────────────────

/**
 * 连接 Schema Lock 和 Provider API：
 * 1. canonical → provider 字段映射
 * 2. HTTP 调用 Provider API
 * 3. provider → canonical 字段映射
 */
export async function connect(params: ConnectParams): Promise<ConnectResult> {
  const { lock, input, connection } = params;
  const startTime = Date.now();

  // 1. canonical → provider 映射
  const providerInput = mapInput(input, lock.field_mappings);

  // 2. 推导 API path
  const { method, path } = deriveApiPath(lock.feature_id);

  // 3. 构建 HTTP 请求
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  switch (connection.auth_type) {
    case "Bearer":
      headers["Authorization"] = `Bearer ${connection.api_key}`;
      break;
    case "APIKey":
      headers["X-API-Key"] = connection.api_key;
      break;
    case "OAuth2":
      headers["Authorization"] = `Bearer ${connection.api_key}`;
      break;
  }

  let normalizedBase = connection.base_url.replace(/\/+$/, "");  // 去掉结尾的斜杠
  let normalizedPath = path.replace(/^\/*/, "/");  // 确保以 / 开头

  // 如果 base_url 包含路径前缀（如 /api/v1），从 derived path 中去除重复前缀
  const baseUrlPath = (() => {
    try { return new URL(normalizedBase).pathname.replace(/\/+$/, ""); } catch { return ""; }
  })();
  if (baseUrlPath && normalizedPath.startsWith(baseUrlPath)) {
    normalizedPath = normalizedPath.slice(baseUrlPath.length) || "/";
  }

  const url = `${normalizedBase}${normalizedPath}`;

  const request: HttpRequest = {
    method,
    url,
    headers,
    body: method === "POST" ? providerInput : undefined,
  };

  // 4. 调用 Provider
  const rawResponse = await callProvider(request);

  // 5. provider → canonical 反向映射
  const providerOutput = (rawResponse && typeof rawResponse === "object")
    ? rawResponse as Record<string, unknown>
    : {};

  const output = mapOutput(providerOutput, lock.field_mappings);

  const latency_ms = Date.now() - startTime;

  // 6. 提取 meta 信息
  const rawObj = providerOutput;
  const model = typeof rawObj.model === "string" ? rawObj.model : undefined;
  const usage = extractUsage(rawObj);

  return {
    output,
    raw: rawResponse,
    meta: {
      provider: lock.provider,
      feature_id: lock.feature_id,
      model,
      usage,
      latency_ms,
    },
  };
}

function extractUsage(raw: Record<string, unknown>): { input_tokens: number; output_tokens: number } | undefined {
  const usage = raw.usage;
  if (!usage || typeof usage !== "object") return undefined;

  const u = usage as Record<string, unknown>;
  const promptTokens = u.prompt_tokens ?? u.input_tokens;
  const completionTokens = u.completion_tokens ?? u.output_tokens;

  if (typeof promptTokens === "number" && typeof completionTokens === "number") {
    return { input_tokens: promptTokens, output_tokens: completionTokens };
  }

  return undefined;
}
