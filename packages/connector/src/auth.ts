/**
 * 认证头构造 — 横切关注点集中在此，便于扩展（HMAC / token 刷新等）
 */

import type { ConnectParams } from "./types.js";

export type AuthType = ConnectParams["connection"]["auth_type"];

/**
 * 按 auth_type 生成认证头。
 *
 * 未知 auth_type 直接抛错：静默发出无认证请求会让 provider 侧返回 401，
 * 掩盖真正的配置错误。
 */
export function buildAuthHeaders(
  connection: Pick<ConnectParams["connection"], "auth_type" | "api_key">,
): Record<string, string> {
  switch (connection.auth_type) {
    case "Bearer":
    case "OAuth2":
      // OAuth2 access token 以 Bearer 形式传递
      return { Authorization: `Bearer ${connection.api_key}` };
    case "APIKey":
      return { "X-API-Key": connection.api_key };
    default: {
      const unsupported: never = connection.auth_type;
      throw new Error(`Unsupported auth_type: ${String(unsupported)}`);
    }
  }
}
