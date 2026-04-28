import type { JsonRpcRequest, JsonRpcResponse } from "./types.js";

export interface WriteFn {
  (chunk: string): void;
}

export function parseRequest(line: string): JsonRpcRequest | null {
  try {
    const parsed = JSON.parse(line);
    if (parsed.jsonrpc === "2.0" && typeof parsed.method === "string") {
      return parsed as JsonRpcRequest;
    }
    return null;
  } catch {
    return null;
  }
}

export function makeResponse(
  id: string | number,
  result: unknown
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function makeError(
  id: string | number,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

export function sendResponse(write: WriteFn, id: string | number, result: unknown): void {
  const res = makeResponse(id, result);
  write(JSON.stringify(res) + "\n");
}

export function sendError(write: WriteFn, id: string | number, code: number, message: string, data?: unknown): void {
  const res = makeError(id, code, message, data);
  write(JSON.stringify(res) + "\n");
}