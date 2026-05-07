import http from "node:http";
import type { MockServerConfig, MockResponse } from "./types.js";
import { validateRequestBody } from "./validator.js";
import { generateFakeResponse } from "./responder.js";

const MAX_BODY_SIZE = 1_048_576; // 1MB
const REQUEST_TIMEOUT = 10_000;   // 10s

export class MockServer {
  private server: http.Server;
  private port: number = 0;
  private running: boolean = false;

  constructor(private config: MockServerConfig) {
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });
    this.server.requestTimeout = REQUEST_TIMEOUT;
  }

  async start(port: number = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, () => {
        const addr = this.server.address();
        this.port = typeof addr === "object" && addr ? addr.port : 0;
        this.running = true;
        resolve(this.port);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.running) {
        resolve();
        return;
      }
      this.server.close(() => {
        this.running = false;
        resolve();
      });
    });
  }

  getPort(): number {
    return this.port;
  }

  isRunning(): boolean {
    return this.running;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Set CORS headers for OPTIONS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Check endpoint
    const url = req.url ?? "/";
    if (url !== this.config.endpoint) {
      this.sendJson(res, 404, { error: `Not found: ${url}` });
      return;
    }

    // Check method
    if (req.method !== this.config.method) {
      this.sendJson(res, 405, { error: `Method ${req.method} not allowed` });
      return;
    }

    // Read body
    const body = await this.readBody(req);

    // Parse JSON
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(body);
    } catch {
      this.sendJson(res, 400, { error: "Invalid JSON in request body" });
      return;
    }

    // Validate against schema
    const validation = validateRequestBody(this.config.schema, parsedBody);
    if (!validation.valid) {
      this.sendJson(res, 422, {
        error: "Request body validation failed",
        validation_errors: validation.errors,
      });
      return;
    }

    // Handle delay
    const delay = this.config.responseDelay ?? 0;
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }

    // Generate fake response
    const fakeBody = generateFakeResponse(this.config.schema);
    this.sendJson(res, 200, fakeBody);
  }

  private sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;

      req.setTimeout(REQUEST_TIMEOUT, () => {
        reject(new Error("Request body read timeout"));
      });

      req.on("data", (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > MAX_BODY_SIZE) {
          reject(new Error("Request body too large"));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf-8"));
      });

      req.on("error", reject);
    });
  }
}
