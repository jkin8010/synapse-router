// MCP types for the JSON-RPC protocol

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

// MCP protocol version
export const MCP_PROTOCOL_VERSION = "2024-11-05";

// Server capabilities
export interface ServerCapabilities {
  tools: {
    listChanged: boolean;
  };
  resources: {
    subscribe: boolean;
    listChanged: boolean;
  };
  prompts: {
    listChanged: boolean;
  };
}

export interface ServerInfo {
  name: string;
  version: string;
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: ServerInfo;
}

// Tool types
export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

// Resource types
export interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourcesListResult {
  resources: Resource[];
}

export interface ResourceReadResult {
  contents: Array<{
    uri: string;
    mimeType: string;
    text: string;
  }>;
}

// Tools call result
export interface ToolsCallResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
}