// @synapse-router/sdk-generator — TypeScript code generator

import type { PackData, GeneratedFile, FeatureEndpointMap } from "./generator.js";
import { featureIdToMethodName, dslTypeToTsType, buildFeatureEndpointMap } from "./generator.js";
import type { ProviderCard, ProviderFeature } from "@synapse-router/core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPascalCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .split(/[_\s-]+/)
    .filter((part) => part.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function className(providerName: string): string {
  return `${toPascalCase(providerName)}Client`;
}

function packageName(providerId: string): string {
  return `@synapse-sdk/${providerId}`;
}

/** Build the endpoint path from feature_id.
 *  chat_post_v1_chat_completions -> /chat/completions
 *  embeddings_post_v1_embeddings -> /embeddings
 *  images_generations_post_v1_images_generations -> /images/generations
 *  Falls back to DSL access_protocol.endpoint when available via the map.
 */
function featureIdToEndpoint(featureId: string, endpointMap?: FeatureEndpointMap): string {
  // Use DSL endpoint when available
  if (endpointMap?.has(featureId)) {
    return endpointMap.get(featureId)!;
  }
  // Extract the path segment after _post_v1_ (or _get_v1_, etc.)
  const match = featureId.match(/_(?:post|get|put|patch|delete)_v\d+_(.+)$/);
  if (match) {
    return "/" + match[1].replace(/_/g, "/");
  }
  // Fallback: use the whole id with underscores -> slashes
  return "/" + featureId.replace(/_/g, "/");
}

// ---------------------------------------------------------------------------
// Type interface generation
// ---------------------------------------------------------------------------

interface FieldInfo {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  enum?: string[];
}

function generateInterface(name: string, fields: FieldInfo[], fieldMappings?: Array<{ canonical_field: string; provider_field: string; fallback?: unknown }>): string {
  const lines: string[] = [];
  lines.push(`export interface ${name} {`);

  for (const field of fields) {
    const tsType = field.enum
      ? field.enum.map((v) => `'${v}'`).join(" | ")
      : dslTypeToTsType(field.type);

    const optional = field.required ? "" : "?";
    const semicolon = ";";

    // Find fallback from field_mappings
    const mapping = fieldMappings?.find((m) => m.provider_field === field.name);
    let jsDoc = "";
    if (field.description || mapping?.fallback !== undefined) {
      const parts: string[] = [];
      if (field.description) parts.push(field.description);
      if (mapping?.fallback !== undefined) parts.push(`@default ${JSON.stringify(mapping.fallback)}`);
      jsDoc = `  /** ${parts.join(" — ")} */\n`;
    }

    lines.push(`${jsDoc}  ${field.name}${optional}: ${tsType}${semicolon}`);
  }

  lines.push("}");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Method generation
// ---------------------------------------------------------------------------

function generateMethod(feature: ProviderFeature, providerId: string, endpointMap?: FeatureEndpointMap): string {
  const methodName = featureIdToMethodName(feature.id);
  const inputTypeName = feature.input.fields.length > 0
    ? toPascalCase(methodName) + "Input"
    : "Record<string, unknown>";
  const outputTypeName = feature.output.fields.length > 0
    ? toPascalCase(methodName) + "Output"
    : "Record<string, unknown>";
  const endpoint = featureIdToEndpoint(feature.id, endpointMap);

  const lines: string[] = [];

  // JSDoc
  lines.push("  /**");
  if (feature.description) {
    lines.push(`   * ${feature.description}`);
  }
  lines.push(`   * Feature: ${feature.id}`);
  lines.push("   */");

  // Method signature
  lines.push(`  async ${methodName}(input: ${inputTypeName}): Promise<${outputTypeName}> {`);

  // Request
  lines.push(`    const url = \`\${this.baseUrl}${endpoint}\`;`);
  lines.push("    const response = await fetch(url, {");
  lines.push("      method: 'POST',");
  lines.push("      headers: {");
  lines.push("        'Content-Type': 'application/json',");
  lines.push("        'Authorization': `Bearer ${this.apiKey}`,");
  lines.push("      },");
  lines.push("      body: JSON.stringify(input),");
  lines.push("    });");

  // Error handling
  lines.push("    if (!response.ok) {");
  lines.push("      let body: unknown;");
  lines.push("      try { body = await response.json(); } catch { body = await response.text(); }");
  lines.push("      throw new ApiError(");
  lines.push("        `HTTP ${response.status} ${response.statusText}`,");
  lines.push("        response.status,");
  lines.push("        undefined,");
  lines.push("        body");
  lines.push("      );");
  lines.push("    }");

  // Return
  lines.push(`    return response.json() as Promise<${outputTypeName}>;`);

  lines.push("  }");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// File generation
// ---------------------------------------------------------------------------

export function generateTypeScript(packData: PackData): GeneratedFile[] {
  const { providerCard, providerId, providerName, baseUrl, authType, dslDocuments } = packData;
  const clientClass = className(providerName);
  const now = new Date().toISOString().split("T")[0];
  const endpointMap = buildFeatureEndpointMap(dslDocuments);

  const files: GeneratedFile[] = [];

  // ---- Per-feature type files (chat.ts, embeddings.ts, etc.) ----
  const featureFileNames: string[] = [];
  for (const feature of providerCard.features) {
    const methodName = featureIdToMethodName(feature.id);
    const fileName = `${methodName}.ts`;
    featureFileNames.push(fileName);
    files.push({
      path: fileName,
      content: generateFeatureFile(feature, providerId),
    });
  }

  // ---- types.ts (barrel re-export) ----
  files.push({
    path: "types.ts",
    content: generateTypesBarrel(featureFileNames),
  });

  // ---- client.ts ----
  files.push({
    path: "client.ts",
    content: generateClientFile(providerCard, clientClass, baseUrl, authType, providerId, providerName, now, endpointMap),
  });

  // ---- index.ts ----
  files.push({
    path: "index.ts",
    content: generateIndexFile(clientClass),
  });

  // ---- package.json ----
  files.push({
    path: "package.json",
    content: generatePackageJson(providerId, providerName),
  });

  // ---- tsconfig.json ----
  files.push({
    path: "tsconfig.json",
    content: generateTsConfig(),
  });

  // ---- README.md ----
  files.push({
    path: "README.md",
    content: generateReadme(providerId, providerName, clientClass, baseUrl, providerCard.features, endpointMap),
  });

  return files;
}

function generateFeatureFile(feature: ProviderFeature, providerId: string): string {
  const methodName = featureIdToMethodName(feature.id);
  const lines: string[] = [];

  lines.push(`// Auto-generated by @synapse-router/sdk-generator`);
  lines.push(`// Provider: ${providerId} — Feature: ${feature.id}`);
  lines.push("");

  // Input type
  if (feature.input.fields.length > 0) {
    const inputName = toPascalCase(methodName) + "Input";
    const fieldMappings = feature.field_mappings as Array<{ canonical_field: string; provider_field: string; fallback?: unknown }>;
    lines.push(generateInterface(inputName, feature.input.fields as Array<FieldInfo>, fieldMappings));
    lines.push("");
  }

  // Output type
  if (feature.output.fields.length > 0) {
    const outputName = toPascalCase(methodName) + "Output";
    lines.push(generateInterface(outputName, feature.output.fields as Array<{ name: string; type: string }>));
    lines.push("");
  }

  return lines.join("\n");
}

function generateTypesBarrel(featureFileNames: string[]): string {
  const lines: string[] = [];
  lines.push("// Auto-generated by @synapse-router/sdk-generator");
  lines.push("// Barrel re-export of all feature types");
  lines.push("");
  for (const fileName of featureFileNames) {
    const base = fileName.replace(".ts", ".js");
    lines.push(`export type * from './${base}';`);
  }
  lines.push("");
  return lines.join("\n");
}

function generateClientFile(
  providerCard: ProviderCard,
  clientClass: string,
  baseUrl: string,
  authType: string,
  providerId: string,
  providerName: string,
  now: string,
  endpointMap?: FeatureEndpointMap,
): string {
  const lines: string[] = [];

  lines.push("/**");
  lines.push(` * Auto-generated by @synapse-router/sdk-generator`);
  lines.push(` * Provider: ${providerName} (${providerId})`);
  lines.push(` * Generated at: ${now}`);
  lines.push(" */");

  // Imports — build from feature method names
  const typeImports: string[] = [];
  for (const feature of providerCard.features) {
    const methodName = featureIdToMethodName(feature.id);
    if (feature.input.fields.length > 0) {
      typeImports.push(`${toPascalCase(methodName)}Input`);
    }
    if (feature.output.fields.length > 0) {
      typeImports.push(`${toPascalCase(methodName)}Output`);
    }
  }

  if (typeImports.length > 0) {
    lines.push(`import type { ${typeImports.join(", ")} } from './types.js';`);
  }
  lines.push("");

  // ApiError class
  lines.push("export class ApiError extends Error {");
  lines.push("  constructor(");
  lines.push("    message: string,");
  lines.push("    public status: number,");
  lines.push("    public code?: string,");
  lines.push("    public raw?: unknown");
  lines.push("  ) {");
  lines.push("    super(message);");
  lines.push("    this.name = 'ApiError';");
  lines.push("  }");
  lines.push("}");
  lines.push("");

  // Class definition
  lines.push(`export class ${clientClass} {`);
  lines.push("  private baseUrl: string;");
  lines.push("  private apiKey: string;");
  lines.push("");

  // Constructor
  lines.push("  constructor(options: {");
  lines.push(`    baseUrl?: string;          // 默认: ${baseUrl}`);
  lines.push("    apiKey: string;");
  lines.push("  }) {");
  lines.push(`    this.baseUrl = options.baseUrl ?? '${baseUrl}';`);
  lines.push("    this.apiKey = options.apiKey;");
  lines.push("  }");

  // Methods
  for (const feature of providerCard.features) {
    lines.push("");
    lines.push(generateMethod(feature, providerId, endpointMap));
  }

  lines.push("}");
  lines.push("");

  return lines.join("\n");
}

function generateIndexFile(clientClass: string): string {
  const lines: string[] = [];
  lines.push(`export { ${clientClass} } from './client.js';`);
  lines.push(`export { ApiError } from './client.js';`);
  lines.push(`export type * from './types.js';`);
  lines.push("");
  return lines.join("\n");
}

function generatePackageJson(providerId: string, providerName: string): string {
  const pkg = {
    name: packageName(providerId),
    version: "1.0.0",
    type: "module",
    main: "index.js",
    types: "index.d.ts",
    description: `Auto-generated SDK for ${providerName} API`,
    license: "Apache-2.0",
    dependencies: {},
  };
  return JSON.stringify(pkg, null, 2) + "\n";
}

function generateTsConfig(): string {
  const config = {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      declaration: true,
      sourceMap: true,
      outDir: "./dist",
      rootDir: ".",
    },
    include: ["*.ts"],
  };
  return JSON.stringify(config, null, 2) + "\n";
}

function generateReadme(
  providerId: string,
  providerName: string,
  clientClass: string,
  baseUrl: string,
  features: readonly ProviderFeature[],
  endpointMap?: FeatureEndpointMap,
): string {
  const now = new Date().toISOString().split("T")[0];

  // Build method reference table rows
  const methodLines: string[] = [];
  for (const feature of features) {
    const methodName = featureIdToMethodName(feature.id);
    const desc = feature.description ?? feature.name;
    const requiredCount = feature.input.fields.filter((f: any) => f.required).length;
    const totalCount = feature.input.fields.length;
    methodLines.push(`| \`${methodName}()\` | \`${baseUrl}${featureIdToEndpoint(feature.id, endpointMap)}\` | ${desc} | ${totalCount} (${requiredCount} required) |`);
  }
  const methodTable = methodLines.join("\n");

  // Build per-method parameter detail tables
  const methodRefLines: string[] = [];
  for (const feature of features) {
    const methodName = featureIdToMethodName(feature.id);
    methodRefLines.push(`### \`${clientClass}.${methodName}(input)\``);
    methodRefLines.push("");
    if (feature.description) methodRefLines.push(feature.description);
    methodRefLines.push("");
    methodRefLines.push("| Parameter | Type | Required | Description |");
    methodRefLines.push("|-----------|------|----------|-------------|");
    for (const field of feature.input.fields as any[]) {
      const tsType = field.enum
        ? field.enum.map((v: string) => `\`'${v}'\``).join(" \\| ")
        : `\`${dslTypeToTsType(field.type)}\``;
      const req = field.required ? "Yes" : "Optional";
      const desc = field.description ?? "—";
      methodRefLines.push(`| \`${field.name}\` | ${tsType} | ${req} | ${desc} |`);
    }
    methodRefLines.push("");
  }

  // Generate example input from first feature
  const exampleFields = features[0].input.fields
    .filter((f: any) => f.name !== "stream")
    .slice(0, 3)
    .map((f: any) => {
      if (f.type === "array") return `      ${f.name}: [{ role: 'user', content: 'Hello!' }],`;
      if (f.type === "string" && f.enum) return `      ${f.name}: '${f.enum[0]}',`;
      if (f.type === "string") return `      ${f.name}: '${f.name === "model" ? "gpt-4o-mini" : "example"}',`;
      if (f.type === "number") return `      ${f.name}: 0.7,`;
      if (f.type === "boolean") return `      ${f.name}: true,`;
      return `      ${f.name}: undefined,`;
    });

  const firstRequired: any = features[0].input.fields.find((f: any) => f.required);
  const errorExampleArg = firstRequired && firstRequired.type === "array"
    ? `      ${firstRequired.name}: [{ role: 'user', content: 'Hello' }],`
    : firstRequired
      ? `      ${firstRequired.name}: 'example',`
      : `      ...: undefined,`;

  const lines: string[] = [];
  lines.push(`# @synapse-sdk/${providerId}`);
  lines.push("");
  lines.push(`> Auto-generated SDK for **${providerName} API**`);
  lines.push(`> Generated on: ${now}`);
  lines.push(`> Generator: @synapse-router/sdk-generator`);
  lines.push("");
  lines.push("Zero-dependency TypeScript SDK. Uses only native `fetch`. No external dependencies.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Installation");
  lines.push("");
  lines.push("```bash");
  lines.push(`# No install needed — copy the ${providerId}/ directory into your project`);
  lines.push("# Requires Node.js 18+ (built-in fetch support)");
  lines.push("```");
  lines.push("");
  lines.push("If you prefer npm:");
  lines.push("");
  lines.push("```bash");
  lines.push(`npm install @synapse-sdk/${providerId}`);
  lines.push("```");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Quick Start");
  lines.push("");
  lines.push("```typescript");
  lines.push(`import { ${clientClass} } from './${providerId}/index.js';`);
  lines.push("");
  lines.push(`const client = new ${clientClass}({`);
  lines.push(`  apiKey: process.env.${providerId.toUpperCase()}_API_KEY!,`);
  lines.push("});");
  lines.push("");
  lines.push("async function main() {");
  lines.push("  try {");
  lines.push(`    const result = await client.${featureIdToMethodName(features[0].id)}({`);
  exampleFields.forEach((f) => lines.push(f));
  lines.push("    });");
  lines.push("    console.log(result);");
  lines.push("  } catch (error) {");
  lines.push("    console.error('Request failed:', error);");
  lines.push("  }");
  lines.push("}");
  lines.push("");
  lines.push("main();");
  lines.push("```");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## API Reference");
  lines.push("");
  lines.push(`### \`new ${clientClass}(config)\``);
  lines.push("");
  lines.push("| Parameter | Type | Required | Description |");
  lines.push("|-----------|------|----------|-------------|");
  lines.push(`| \`apiKey\` | \`string\` | Yes | API key for ${providerName} |`);
  lines.push(`| \`baseUrl\` | \`string\` | Optional | API base URL (default: \`${baseUrl}\`) |`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("### Method Reference");
  lines.push("");
  lines.push("| Method | Endpoint | Description | Parameters |");
  lines.push("|--------|----------|-------------|------------|");
  lines.push(methodTable);
  lines.push("");
  lines.push(methodRefLines.join("\n"));
  lines.push("---");
  lines.push("");
  lines.push("## Error Handling");
  lines.push("");
  lines.push("All methods throw `ApiError` on non-2xx responses:");
  lines.push("");
  lines.push("```typescript");
  lines.push(`import { ${clientClass}, ApiError } from './${providerId}/index.js';`);
  lines.push("");
  lines.push(`const client = new ${clientClass}({`);
  lines.push(`  apiKey: process.env.${providerId.toUpperCase()}_API_KEY!,`);
  lines.push("});");
  lines.push("");
  lines.push("async function safeCall() {");
  lines.push("  try {");
  lines.push(`    return await client.${featureIdToMethodName(features[0].id)}({`);
  lines.push(errorExampleArg);
  lines.push("    });");
  lines.push("  } catch (error) {");
  lines.push("    if (error instanceof ApiError) {");
  lines.push("      console.error(`HTTP ${error.status}: ${error.message}`);");
  lines.push("      console.error('Raw response:', error.raw);");
  lines.push("    } else {");
  lines.push("      console.error('Unexpected error:', error);");
  lines.push("    }");
  lines.push("  }");
  lines.push("}");
  lines.push("```");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Generated by");
  lines.push("");
  lines.push("**@synapse-router/sdk-generator** — [synapse-router](https://github.com/useeclaw/synapse-router)");
  lines.push("");
  lines.push(`*This SDK was auto-generated on ${now}. Regenerate with \`synapse evolve\` to pick up provider updates.*`);

  return lines.join("\n");
}
