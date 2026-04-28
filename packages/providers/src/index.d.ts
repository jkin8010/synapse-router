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
export declare function createProviderRegistry(initialProviders?: Provider[]): ProviderRegistry;
export declare function createUserProviderRegistry(initialProviders?: RegisteredProvider[]): UserProviderRegistry;
export declare class OpenAIProvider implements Provider {
    readonly name = "openai";
    supports(task: string): boolean;
    generate(_input: GenerateInput): Promise<GenerateResult>;
}
export declare class ComfyUIProvider implements Provider {
    readonly name = "comfyui";
    supports(task: string): boolean;
    generate(_input: GenerateInput): Promise<GenerateResult>;
}
export declare function registerProvider(provider: Provider | RegisteredProvider): void;
export declare function getProviders(): Provider[];
export declare function loadAllSpecs(specRoot?: string): ProviderSpec[];
export declare function loadProviders(providerRoot?: string, registry?: UserProviderRegistry): UserProviderRegistry;
export declare function getProviderRegistry(): UserProviderRegistry;
export declare function validateSpec(spec: unknown): SpecValidationResult;
