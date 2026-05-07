import type { Tool } from "./types.js";
import type { Vault } from "@synapse-router/vault";
import { loadAllSpecs, loadProviders } from "@synapse-router/providers";
import { negotiateAndVerify } from "@synapse-router/negotiator";
import { homedir } from "node:os";
import { join } from "node:path";

// Tool Definitions

export const MCP_TOOLS: Tool[] = [
  {
    name: "vault_set_key",
    description: "Store an API key for a provider",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string" },
        key: { type: "string" },
        auth_type: {
          type: "string",
          enum: ["APIKey", "Bearer", "OAuth2"]
        }
      },
      required: ["provider", "key"]
    }
  },
  {
    name: "vault_list_keys",
    description: "List all providers with stored keys",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "vault_get_key",
    description: "Get the API key for a specific provider",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string" }
      },
      required: ["provider"]
    }
  },
  {
    name: "provider_list",
    description: "List all available provider packs",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "provider_show",
    description: "Show details for a specific provider",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string" }
      },
      required: ["provider"]
    }
  },
  {
    name: "negotiate",
    description: "Run schema negotiation between agent schema and providers",
    inputSchema: {
      type: "object",
      properties: {
        agent_schema: { type: "object" },
        provider_id: { type: "string" },
        pack_dir: { type: "string" }
      },
      required: ["provider_id"]
    }
  },
  {
    name: "execute",
    description: "Execute a provider feature with given input",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string" },
        feature: { type: "string" },
        input: { type: "object" }
      },
      required: ["provider", "feature", "input"]
    }
  }
];

// Tool Handlers

export async function handleToolCall(
  params: unknown,
  vault: Vault
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const p = params as Record<string, unknown>;
  const tool = p.name as string;
  const args = p.arguments as Record<string, unknown>;

  switch (tool) {
    case "vault_set_key": {
      const provider = args.provider as string;
      const key = args.key as string;
      const authType = args.auth_type as string | undefined;
      const resolvedAuthType = authType ?? "APIKey";
      await vault.setKey(provider, key, resolvedAuthType as "APIKey" | "Bearer" | "OAuth2");
      return { content: [{ type: "text", text: JSON.stringify({ success: true, provider }) }] };
    }

    case "vault_list_keys": {
      const providers = await vault.listKeys();
      return { content: [{ type: "text", text: JSON.stringify({ providers }) }] };
    }

    case "vault_get_key": {
      const provider = args.provider as string;
      const key = await vault.getKey(provider);
      return { content: [{ type: "text", text: JSON.stringify({ provider, key }) }] };
    }

    case "provider_list": {
      const specs = loadAllSpecs();
      const userRegistry = loadProviders();
      const userProviders = userRegistry.getProviders();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            providers: [
              ...specs.map((s) => ({ name: s.name, version: s.version, source: "builtin" })),
              ...userProviders.map((pr) => ({ name: pr.spec.name, version: pr.spec.version, source: "user" }))
            ]
          })
        }]
      };
    }

    case "provider_show": {
      const providerName = args.provider as string;
      const specs = loadAllSpecs();
      const spec = specs.find((s) => s.name === providerName);
      if (spec) {
        return { content: [{ type: "text", text: JSON.stringify(spec) }] };
      }
      const userRegistry = loadProviders();
      const userProvider = userRegistry.getProviders().find((pr) => pr.spec.name === providerName);
      if (userProvider) {
        return { content: [{ type: "text", text: JSON.stringify(userProvider.spec) }] };
      }
      throw new Error(`Provider not found: ${providerName}`);
    }

    case "negotiate": {
      const agentSchema = args.agent_schema as { task?: string; goal?: string; constraints?: unknown } | undefined;
      const providerId = args.provider_id as string;
      const packDir = (args.pack_dir as string) ?? join(homedir(), ".synapse", "packs", providerId);

      if (!agentSchema?.task) {
        throw new Error("agent_schema.task is required for negotiate");
      }

      const result = await negotiateAndVerify({
        task: agentSchema.task,
        goal: agentSchema.goal ?? "",
        constraints: (agentSchema.constraints as Record<string, unknown>) ?? {},
        providerId,
        packDir,
        lang: "typescript",
      });

      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    case "execute": {
      const provider = args.provider as string;
      const feature = args.feature as string;
      const input = args.input as Record<string, unknown>;

      const userRegistry = loadProviders();
      const providers = userRegistry.getProviders();
      const pr = providers.find((prov) => prov.spec.name === provider);

      if (!pr) {
        throw new Error(`Provider not found: ${provider}`);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ provider, feature, executed: true, input })
        }]
      };
    }

    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}
