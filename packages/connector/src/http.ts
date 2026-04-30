/**
 * HTTP 调用逻辑 — 基于原生 fetch
 */

export interface HttpRequest {
  method: "POST" | "GET";
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

/**
 * 调用 Provider API
 *
 * 使用原生 fetch，不依赖 node-fetch
 */
export async function callProvider(request: HttpRequest): Promise<unknown> {
  const { method, url, headers, body } = request;

  const fetchOptions: globalThis.RequestInit = {
    method,
    headers,
  };

  if (method === "POST" && body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await globalThis.fetch(url, fetchOptions);

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new ConnectorHttpError(
      response.status,
      response.statusText,
      url,
      errorBody,
    );
  }

  return response.json();
}

/**
 * Connector HTTP 错误
 */
export class ConnectorHttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly body: string;

  constructor(status: number, statusText: string, url: string, body: string) {
    super(`HTTP ${status} ${statusText} — ${url}: ${body.slice(0, 200)}`);
    this.name = "ConnectorHttpError";
    this.status = status;
    this.statusText = statusText;
    this.url = url;
    this.body = body;
  }
}
