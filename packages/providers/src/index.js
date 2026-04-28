import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
export function createProviderRegistry(initialProviders = []) {
    const providers = new Map();
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
export function createUserProviderRegistry(initialProviders = []) {
    const providers = new Map();
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
export class OpenAIProvider {
    name = "openai";
    supports(task) {
        return !isImageTask(task);
    }
    async generate(_input) {
        return {
            provider: this.name,
            output: "mock-openai-result"
        };
    }
}
export class ComfyUIProvider {
    name = "comfyui";
    supports(task) {
        return isImageTask(task);
    }
    async generate(_input) {
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
export function registerProvider(provider) {
    if (isRegisteredProvider(provider)) {
        userProviderRegistry.registerProvider(provider);
        return;
    }
    defaultRegistry.registerProvider(provider);
}
export function getProviders() {
    return defaultRegistry.getProviders();
}
export function loadAllSpecs(specRoot = getDefaultSpecRoot()) {
    const specs = readdirSync(specRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
        const specPath = join(specRoot, entry.name, "spec.json");
        return JSON.parse(readFileSync(specPath, "utf8"));
    });
    return specs.map((spec) => {
        const validation = validateSpec(spec);
        if (!validation.valid) {
            throw new Error(`Invalid provider spec: ${validation.errors.join("; ")}`);
        }
        return spec;
    });
}
export function loadProviders(providerRoot = getDefaultUserProviderRoot(), registry = userProviderRegistry) {
    if (!existsSync(providerRoot)) {
        return registry;
    }
    const providerDirs = readdirSync(providerRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of providerDirs) {
        const providerDir = join(providerRoot, entry.name);
        const config = readJson(join(providerDir, "config.json"));
        if (config?.enabled !== true) {
            continue;
        }
        const spec = readJson(join(providerDir, "spec.json"));
        const validation = validateSpec(spec);
        if (!validation.valid) {
            throw new Error(`Invalid provider spec in ${providerDir}: ${validation.errors.join("; ")}`);
        }
        registry.registerProvider({
            spec: spec,
            config
        });
    }
    return registry;
}
export function getProviderRegistry() {
    return userProviderRegistry;
}
export function validateSpec(spec) {
    const errors = [];
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
function isImageTask(task) {
    const normalized = task.toLowerCase();
    return normalized.includes("image") || normalized.includes("photo") || normalized.includes("picture");
}
function getDefaultSpecRoot() {
    return join(dirname(fileURLToPath(import.meta.url)), "..", "specs");
}
function getDefaultUserProviderRoot() {
    return join(homedir(), ".synapse", "providers");
}
function readJson(path) {
    if (!existsSync(path)) {
        return undefined;
    }
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    }
    catch (error) {
        throw new Error(`Failed to read JSON file ${path}: ${error.message}`);
    }
}
function isRegisteredProvider(provider) {
    return "spec" in provider && "config" in provider;
}
function validateCapabilities(value, errors) {
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
function validatePerformance(value, errors) {
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
function validateObjectSection(value, name, errors) {
    if (!isRecord(value)) {
        errors.push(`${name} is required`);
        return;
    }
    if (Object.keys(value).length === 0) {
        errors.push(`${name} cannot be empty`);
    }
}
function validateStringArray(value, path, errors) {
    if (!Array.isArray(value) || value.length === 0) {
        errors.push(`${path} must be a non-empty string array`);
        return;
    }
    if (value.some((item) => !isNonEmptyString(item))) {
        errors.push(`${path} must contain only non-empty strings`);
    }
}
function requireNonEmptyString(record, key, errors) {
    if (!isNonEmptyString(record[key])) {
        errors.push(`${key} is required`);
    }
}
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
//# sourceMappingURL=index.js.map