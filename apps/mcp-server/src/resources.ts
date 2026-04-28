import type { Resource } from "./types.js";
import type { Vault } from "@synapse-router/vault";
import { loadAllSpecs, loadProviders } from "@synapse-router/providers";

export const MCP_RESOURCES: Resource[] = [
  {
    uri: "providers://list",
    name: "providers_list",
    description: "Returns a summary of all available Provider Packs",
    mimeType: "application/json"
  },
  {
    uri: "vault://status",
    name: "vault_status",
    description: "Returns Vault status (whether it has an encryption key, number of stored providers)",
    mimeType: "application/json"
  }
];

export async function handleResourceRead(
  params: Record<string, unknown>,
  vault: Vault
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  const uri = params.uri as string;

  if (uri === "providers://list") {
    const specs = loadAllSpecs();
    const userRegistry = loadProviders();
    const userProviders = userRegistry.getProviders();

    const summary = [
      ...specs.map((s) => ({
        name: s.name,
        version: s.version,
        source: "builtin",
        tasks: s.capabilities.tasks,
        modalities: s.capabilities.modalities
      })),
      ...userProviders.map((p) => ({
        name: p.spec.name,
        version: p.spec.version,
        source: "user",
        tasks: p.spec.capabilities.tasks,
        modalities: p.spec.capabilities.modalities
      }))
    ];

    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify({ providers: summary })
      }]
    };
  }

  if (uri === "vault://status") {
    const providers = await vault.listKeys();
    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify({
          hasEncryptionKey: true,
          providerCount: providers.length,
          providers
        })
      }]
    };
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}