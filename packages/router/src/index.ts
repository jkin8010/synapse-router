import {
  getProviders,
  loadAllSpecs,
  type ProviderSpec,
  type Provider
} from "@synapse-router/providers";

export interface RouteDefinition {
  source: string;
  target: string;
}

export type RoutingStrategy = "cheap" | "fast" | "quality";

export type ProviderName = string;

const DEFAULT_PROVIDER_BY_STRATEGY: Record<RoutingStrategy, ProviderName> = {
  cheap: "replicate",
  fast: "openai",
  quality: "comfyui"
};

export function route(task: string, strategy: RoutingStrategy): ProviderName {
  const providers = getProvidersForTask(task);
  const preferredProvider = DEFAULT_PROVIDER_BY_STRATEGY[strategy];
  const matchedProvider = providers.find((provider) => provider.name === preferredProvider) ?? providers[0];

  if (matchedProvider === undefined) {
    throw new Error(`No provider supports task: ${task}`);
  }

  return matchedProvider.name;
}

export function getProvidersForTask(task: string): Provider[] {
  return getProviders().filter((provider) => provider.supports(task));
}

export function getProviderSpecsForTask(task: string): ProviderSpec[] {
  const normalizedTask = task.toLowerCase();

  return loadAllSpecs().filter((spec) =>
    spec.capabilities.tasks.some((capability) => normalizedTask.includes(capability))
  );
}
