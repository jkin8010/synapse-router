import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface GenerateInput {
  task: string;
  payload?: unknown;
}

export interface GenerateResult {
  provider: string;
  output?: string;
  image_url?: string;
}

export interface Provider {
  name: string;
  supports(task: string): boolean;
  generate(input: GenerateInput): Promise<GenerateResult>;
}

export interface ProviderRegistry {
  registerProvider(provider: Provider): void;
  getProviders(): Provider[];
}

export interface ProviderConfig {
  enabled?: boolean;
  [key: string]: unknown;
}

export interface RegisteredProvider {
  spec: ProviderSpec;
  config: ProviderConfig;
}

export interface UserProviderRegistry {
  registerProvider(provider: RegisteredProvider): void;
  getProviders(): RegisteredProvider[];
}

export interface ProviderSpec {
  name: string;
  version: string;
  docs: string;
  capabilities: {
    tasks: string[];
    modalities: string[];
    structured_output: boolean;
  };
  pricing: Record<string, string | number | boolean>;
  limits: Record<string, string | number | boolean>;
  performance: {
    latency: "cheap" | "fast" | "quality";
    reliability: "low" | "medium" | "high";
  };
}

export interface SpecValidationResult {
  valid: boolean;
  errors: string[];
}

export function createProviderRegistry(initialProviders: Provider[] = []): ProviderRegistry {
  const providers = new Map<string, Provider>();

  for (const provider of initialProviders) {
    providers.set(provider.name, provider);
  }

  return {
    registerProvider(provider) {
      providers.set(provider.name, provider);
    },
    getProviders() {
      return [...providers.values()];
    }
  };
}

export function createUserProviderRegistry(initialProviders: RegisteredProvider[] = []): UserProviderRegistry {
  const providers = new Map<string, RegisteredProvider>();

  for (const provider of initialProviders) {
    providers.set(provider.spec.name, provider);
  }

  return {
    registerProvider(provider) {
      providers.set(provider.spec.name, provider);
    },
    getProviders() {
      return [...providers.values()];
    }
  };
}

export class OpenAIProvider implements Provider {
  readonly name = "openai";

  supports(task: string): boolean {
    return !isImageTask(task);
  }

  async generate(_input: GenerateInput): Promise<GenerateResult> {
    return {
      provider: this.name,
      output: "mock-openai-result"
    };
  }
}

export class ComfyUIProvider implements Provider {
  readonly name = "comfyui";

  supports(task: string): boolean {
    return isImageTask(task);
  }

  async generate(_input: GenerateInput): Promise<GenerateResult> {
    return {
      provider: this.name,
      image_url: "https://example.com/mock-images/comfyui.png"
    };
  }
}

const defaultRegistry = createProviderRegistry([
  new OpenAIProvider(),
  new ComfyUIProvider()
]);
const userProviderRegistry = createUserProviderRegistry();

export function registerProvider(provider: Provider | RegisteredProvider): void {
  if (isRegisteredProvider(provider)) {
    userProviderRegistry.registerProvider(provider);
    return;
  }

  defaultRegistry.registerProvider(provider);
}

export function getProviders(): Provider[] {
  return defaultRegistry.getProviders();
}

export function loadAllSpecs(specRoot = getDefaultSpecRoot()): ProviderSpec[] {
  const specs = readdirSync(specRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const specPath = join(specRoot, entry.name, "spec.json");
      return JSON.parse(readFileSync(specPath, "utf8")) as unknown;
    });

  return specs.map((spec) => {
    const validation = validateSpec(spec);

    if (!validation.valid) {
      throw new Error(`Invalid provider spec: ${validation.errors.join("; ")}`);
    }

    return spec as ProviderSpec;
  });
}

export function loadProviders(
  providerRoot = getDefaultUserProviderRoot(),
  registry: UserProviderRegistry = userProviderRegistry
): UserProviderRegistry {
  if (!existsSync(providerRoot)) {
    return registry;
  }

  const providerDirs = readdirSync(providerRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of providerDirs) {
    const providerDir = join(providerRoot, entry.name);
    const config = readJson(join(providerDir, "config.json")) as ProviderConfig | undefined;

    if (config?.enabled !== true) {
      continue;
    }

    const spec = readJson(join(providerDir, "spec.json"));
    const validation = validateSpec(spec);

    if (!validation.valid) {
      throw new Error(`Invalid provider spec in ${providerDir}: ${validation.errors.join("; ")}`);
    }

    registry.registerProvider({
      spec: spec as ProviderSpec,
      config
    });
  }

  return registry;
}

export function getProviderRegistry(): UserProviderRegistry {
  return userProviderRegistry;
}

export function validateSpec(spec: unknown): SpecValidationResult {
  const errors: string[] = [];

  if (!isRecord(spec)) {
    return { valid: false, errors: ["spec must be an object"] };
  }

  requireNonEmptyString(spec, "name", errors);
  requireNonEmptyString(spec, "version", errors);
  requireNonEmptyString(spec, "docs", errors);
  validateCapabilities(spec.capabilities, errors);
  validateObjectSection(spec.pricing, "pricing", errors);
  validateObjectSection(spec.limits, "limits", errors);
  validatePerformance(spec.performance, errors);

  return {
    valid: errors.length === 0,
    errors
  };
}

function isImageTask(task: string): boolean {
  const normalized = task.toLowerCase();
  return normalized.includes("image") || normalized.includes("photo") || normalized.includes("picture");
}

function getDefaultSpecRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "specs");
}

function getDefaultUserProviderRoot(): string {
  return join(homedir(), ".synapse", "providers");
}

function readJson(path: string): unknown | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Failed to read JSON file ${path}: ${(error as Error).message}`);
  }
}

function isRegisteredProvider(provider: Provider | RegisteredProvider): provider is RegisteredProvider {
  return "spec" in provider && "config" in provider;
}

function validateCapabilities(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("capabilities is required");
    return;
  }

  validateStringArray(value.tasks, "capabilities.tasks", errors);
  validateStringArray(value.modalities, "capabilities.modalities", errors);

  if (typeof value.structured_output !== "boolean") {
    errors.push("capabilities.structured_output must be boolean");
  }
}

function validatePerformance(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("performance is required");
    return;
  }

  if (!["cheap", "fast", "quality"].includes(String(value.latency))) {
    errors.push("performance.latency must be cheap, fast, or quality");
  }

  if (!["low", "medium", "high"].includes(String(value.reliability))) {
    errors.push("performance.reliability must be low, medium, or high");
  }
}

function validateObjectSection(value: unknown, name: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${name} is required`);
    return;
  }

  if (Object.keys(value).length === 0) {
    errors.push(`${name} cannot be empty`);
  }
}

function validateStringArray(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must be a non-empty string array`);
    return;
  }

  if (value.some((item) => !isNonEmptyString(item))) {
    errors.push(`${path} must contain only non-empty strings`);
  }
}

function requireNonEmptyString(record: Record<string, unknown>, key: string, errors: string[]): void {
  if (!isNonEmptyString(record[key])) {
    errors.push(`${key} is required`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
