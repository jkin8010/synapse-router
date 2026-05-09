// @synapse-router/sdk-generator — TypeScript code generator

import type { PackData, GeneratedFile } from "./generator.js";
import { featureIdToMethodName, dslTypeToTsType } from "./generator.js";
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
 *  chat_post_v1_chat_completions → /chat/completions
 *  embeddings_post_v1_embeddings → /embeddings
 *  images_generations_post_v1_images_generations → /images/generations
 */
function featureIdToEndpoint(featureId: string): string {
  // Extract the path segment after _post_v1_ (or _get_v1_, etc.)
  const match = featureId.match(/_(?:post|get|put|patch|delete)_v\d+_(.+)$/);
  if (match) {
    return "/" + match[1].replace(/_/g, "/");
  }
  // Fallback: use the whole id with underscores → slashes
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

function generateMethod(feature: ProviderFeature, providerId: string): string {
  const methodName = featureIdToMethodName(feature.id);
  const inputTypeName = feature.input.fields.length > 0
    ? toPascalCase(methodName) + "Input"
    : "Record<string, unknown>";
  const outputTypeName = feature.output.fields.length > 0
    ? toPascalCase(methodName) + "Output"
    : "Record<string, unknown>";
  const endpoint = featureIdToEndpoint(feature.id);

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
  lines.push("      const text = await response.text();");
  lines.push("      throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);");
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
  const { providerCard, providerId, providerName, baseUrl, authType } = packData;
  const clientClass = className(providerName);
  const now = new Date().toISOString().split("T")[0];

  const files: GeneratedFile[] = [];

  // ---- types.ts ----
  files.push({
    path: "types.ts",
    content: generateTypesFile(providerCard, providerId),
  });

  // ---- client.ts ----
  files.push({
    path: "client.ts",
    content: generateClientFile(providerCard, clientClass, baseUrl, authType, providerId, providerName, now),
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
    content: generateReadme(providerId, providerName, clientClass, baseUrl),
  });

  return files;
}

function generateTypesFile(providerCard: ProviderCard, providerId: string): string {
  const lines: string[] = [];

  lines.push(`// Auto-generated by @synapse-router/sdk-generator`);
  lines.push(`// Provider: ${providerId}`);
  lines.push(`// Do not edit manually — regenerate with: synapse sdk generate --pack ${providerId} --lang typescript`);
  lines.push("");

  // Track generated type names to avoid duplicates
  const generatedTypes = new Set<string>();

  for (const feature of providerCard.features) {
    const methodName = featureIdToMethodName(feature.id);

    // Input type
    if (feature.input.fields.length > 0) {
      const inputName = toPascalCase(methodName) + "Input";

      // Build field mappings for this feature (from provider-card)
      const fieldMappings = feature.field_mappings as Array<{ canonical_field: string; provider_field: string; fallback?: unknown }>;

      lines.push(generateInterface(inputName, feature.input.fields as Array<FieldInfo>, fieldMappings));
      generatedTypes.add(inputName);
      lines.push("");
    }

    // Output type
    if (feature.output.fields.length > 0) {
      const outputName = toPascalCase(methodName) + "Output";
      lines.push(generateInterface(outputName, feature.output.fields as Array<{ name: string; type: string }>));
      generatedTypes.add(outputName);
      lines.push("");
    }
  }

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
    lines.push(generateMethod(feature, providerId));
  }

  lines.push("}");
  lines.push("");

  return lines.join("\n");
}

function generateIndexFile(clientClass: string): string {
  const lines: string[] = [];
  lines.push(`export { ${clientClass} } from './client.js';`);
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

function generateReadme(providerId: string, providerName: string, clientClass: string, baseUrl: string): string {
  return `# @synapse-sdk/${providerId}

Auto-generated SDK for ${providerName} API.

## Installation

\`\`\`bash
npm install @synapse-sdk/${providerId}
\`\`\`

## Usage

\`\`\`typescript
import { ${clientClass} } from '@synapse-sdk/${providerId}';

const client = new ${clientClass}({
  apiKey: process.env.${providerId.toUpperCase()}_API_KEY!,
  // baseUrl: '${baseUrl}',  // default, can override for other providers
});

// Chat completions
const result = await client.chat({
  messages: [{ role: 'user', content: 'Hello!' }],
  model: 'gpt-4',
});
\`\`\`

## Generated by

@synapse-router/sdk-generator — [synapse-router](https://github.com/qise-tech/synapse-router)
`;
}
