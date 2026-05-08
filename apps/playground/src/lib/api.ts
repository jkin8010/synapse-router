export interface ApiConfig {
  baseUrl: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function createApiClient(config: ApiConfig = { baseUrl: "http://localhost:3000" }) {
  async function getProviders() {
    const res = await fetch(`${config.baseUrl}/providers`);
    if (!res.ok) throw new ApiError("Failed to fetch providers", res.status);
    return res.json();
  }

  async function negotiate(schema: unknown, providerId?: string, signal?: AbortSignal) {
    const res = await fetch(`${config.baseUrl}/negotiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_schema: schema,
        provider_id: providerId,
      }),
      signal,
    });
    if (!res.ok) throw new ApiError("Negotiation failed", res.status, await res.json());
    return res.json();
  }

  async function execute(
    params: {
      negotiation_id?: string;
      provider_id?: string;
      input?: unknown;
    },
    signal?: AbortSignal,
  ) {
    const res = await fetch(`${config.baseUrl}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal,
    });
    if (!res.ok) throw new ApiError("Execution failed", res.status, await res.json());
    return res.json();
  }

  return { getProviders, negotiate, execute };
}
