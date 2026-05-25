// @synapse-router/cli — `synapse negotiate` command
// Schema negotiation: full pipeline (Mode 1) or schema-file matching (Mode 2).

import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createVault } from "@synapse-router/vault";
import { loadMergedConfig } from "../utils/config.js";
import { negotiateAndVerify, matchManifest, loadManifestFromPack } from "@synapse-router/negotiator";
import type { NegotiateAndVerifyInput, NegotiationResult, ContractVerificationError } from "@synapse-router/negotiator";
import type { ProviderCard } from "@synapse-router/core";
import { getOrCreateLock, LockStorage } from "@synapse-router/lock";
import { findPacksDir, loadProviderCard, USER_PACKS_DIR, LOCAL_PACKS_DIR } from "../utils/packs.js";
import { isInteractive } from "../utils/tty.js";
import { promptSearch, promptSelect, promptCheckbox, promptConfirm } from "../utils/prompts.js";
import { HELP_NEGOTIATE } from "../utils/help.js";
import pc from "picocolors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NegotiateOptions {
  schemaFile?: string;
  intent?: string;
  provider?: string;
  format?: "json" | "table";
  noCache?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  noSave?: boolean;
  noInteractive?: boolean;
}

// ---------------------------------------------------------------------------
// Interactive mode helpers
// ---------------------------------------------------------------------------

interface ProviderForIntent {
  providerId: string;
  featureId: string;
  providerName: string;
}

/**
 * Scan all installed packs (built-in, local, user) and collect unique
 * feature.intent values. Returns sorted alphabetically.
 * Skips invalid/missing provider cards without crashing.
 */
async function collectAvailableIntents(packsDir: string): Promise<string[]> {
  const intents = new Set<string>();
  for (const dir of [packsDir, LOCAL_PACKS_DIR(), USER_PACKS_DIR]) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      try {
        const cardPath = join(dir, entry.name, "provider-card.json");
        const content = await readFile(cardPath, "utf8");
        const card = JSON.parse(content) as ProviderCard;
        for (const feature of card.features) {
          if (feature.intent) intents.add(feature.intent);
        }
      } catch {
        // skip invalid packs
      }
    }
  }
  return [...intents].sort();
}

/**
 * Scan all packs and return only those that have a feature with the
 * given intent. Each result includes providerId, featureId, and providerName.
 */
async function collectProvidersForIntent(
  packsDir: string,
  intent: string,
): Promise<ProviderForIntent[]> {
  const providers: ProviderForIntent[] = [];
  for (const dir of [packsDir, LOCAL_PACKS_DIR(), USER_PACKS_DIR]) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      try {
        const cardPath = join(dir, entry.name, "provider-card.json");
        const content = await readFile(cardPath, "utf8");
        const card = JSON.parse(content) as ProviderCard;
        for (const feature of card.features) {
          if (feature.intent === intent) {
            providers.push({
              providerId: card.provider.id,
              featureId: feature.id,
              providerName: card.provider.name,
            });
          }
        }
      } catch {
        // skip invalid packs
      }
    }
  }
  return providers;
}

// ---------------------------------------------------------------------------
// Schema display and field selection helpers
// ---------------------------------------------------------------------------

/** Display feature input/output schema with picocolors formatting */
function displayFeatureSchema(feature: any): void {
  console.log(pc.bold(pc.cyan("\n  Feature: " + (feature.name ?? feature.id))));
  console.log(pc.dim("  " + ((feature as any).description ?? "No description")));

  // Input fields
  console.log(pc.bold("\n  Input Fields (" + feature.input.fields.length + "):"));
  for (const f of feature.input.fields) {
    const marker = f.required ? pc.green("  [required]") : pc.yellow("  [optional]");
    const typeInfo = pc.dim(" : " + f.type);
    const enumInfo = (f as any).enum?.length ? pc.dim(" {" + (f as any).enum.join("|") + "}") : "";
    console.log("    " + pc.bold(f.name) + typeInfo + " " + marker + enumInfo);
  }

  // Output fields
  console.log(pc.bold("\n  Output Fields (" + feature.output.fields.length + "):"));
  for (const f of feature.output.fields) {
    console.log("    " + pc.bold(f.name) + pc.dim(" : " + f.type));
  }
}

/** Build checkbox choices from feature input fields */
function buildFieldChoices(feature: any): any[] {
  return feature.input.fields.map((f: any) => ({
    name: `${f.name} : ${f.type}${f.required ? " (required)" : ""}`,
    value: f.name,
    checked: true,
    disabled: f.required || false,
  }));
}

// ---------------------------------------------------------------------------
// Lock diff preview
// ---------------------------------------------------------------------------

/**
 * Show lock diff preview before save: compare existing lock (if any)
 * with new negotiation result.
 */
async function showLockDiffPreview(
  intent: string,
  provider: string,
  result: NegotiationResult,
  configDir: string,
): Promise<void> {
  const storage = new LockStorage(join(configDir, "schemas"));
  const existingLocks = await storage.list();
  const existingLock = existingLocks.find(
    (l: any) => l.intent === intent && l.provider === provider,
  );

  if (existingLock) {
    const oldLock = await storage.load(existingLock.lock_id);
    console.log(pc.bold(pc.cyan("\n  Lock Diff Preview")));
    console.log(pc.dim("  " + "=".repeat(50)));
    console.log(pc.yellow("  Current lock:  " + existingLock.lock_id));
    console.log(pc.dim("    Created:     " + (oldLock?.locked_at ?? "unknown")));
    console.log(pc.dim("    Fields:      " + (oldLock?.input_schema?.fields?.length ?? 0)));
    console.log(pc.green("  New negotiation:"));
    console.log(pc.dim("    Schema:      " + result.schema_id));
    console.log(pc.dim("    Fields:      " + result.schema.fields.length));

    const oldNames = new Set((oldLock?.input_schema?.fields ?? []).map((f: any) => f.name));
    const newNames = new Set(result.schema.fields.map((f: any) => f.name));
    const added = result.schema.fields.filter((f: any) => !oldNames.has(f.name));
    const removed = (oldLock?.input_schema?.fields ?? []).filter((f: any) => !newNames.has(f.name));

    if (added.length > 0) {
      console.log(pc.green("    + Added:      " + added.map((f: any) => f.name).join(", ")));
    }
    if (removed.length > 0) {
      console.log(pc.red("    - Removed:    " + removed.map((f: any) => f.name).join(", ")));
    }
    if (added.length === 0 && removed.length === 0) {
      console.log(pc.dim("    (No field changes -- lock will be re-created)"));
    }
  } else {
    console.log(pc.dim("\n  First Schema Lock for " + intent + " / " + provider));
  }
}

// ---------------------------------------------------------------------------
// Post-negotiation routing menu
// ---------------------------------------------------------------------------

/**
 * Display 5-option routing menu after successful negotiation.
 * Tier: confirmation -- user chooses from list
 */
async function promptRoutingMenu(
  selectedProvider: string,
  selectedIntent: string,
  _result: NegotiationResult,
): Promise<void> {
  console.log(pc.bold(pc.cyan("\n  What would you like to do next?\n")));

  const routeChoices = [
    {
      name: pc.green("Test connection") + pc.dim("  (synapse connect)"),
      value: "connect",
      description: `synapse connect ${selectedProvider} ${selectedIntent} --input '...'`,
    },
    {
      name: pc.green("Generate SDK") + pc.dim("  (synapse evolve)"),
      value: "evolve",
      description: `synapse evolve --provider ${selectedProvider}`,
    },
    {
      name: pc.cyan("Show SDK integration code"),
      value: "sdk-code",
      description: "Display @synapse-router/sdk import + usage example",
    },
    {
      name: pc.magenta("Open in Playground"),
      value: "playground",
      description: "Open the web Playground for visual exploration",
    },
    {
      name: pc.dim("Save and exit"),
      value: "exit",
      description: "Return to shell",
    },
  ];

  // Tier: confirmation -- user chooses from list
  const action = await promptSelect("Select an action:", routeChoices, { pageSize: 7 });

  switch (action) {
    case "connect":
      console.log(pc.cyan("\n  Run this command to test:"));
      console.log(pc.bold("  synapse connect " + selectedProvider + " " + selectedIntent + " --input '{\"...\":\"...\"}'"));
      console.log(pc.dim("\n  Add --billing preCall to track costs."));
      break;
    case "evolve":
      console.log(pc.cyan("\n  Generate a zero-dependency SDK:"));
      console.log(pc.bold("  synapse evolve --provider " + selectedProvider));
      console.log(pc.dim("\n  Add --with-billing for BillingTracker."));
      console.log(pc.dim("  Add --output ./my-sdk for custom output directory."));
      break;
    case "sdk-code":
      console.log(pc.cyan("\n  SDK Integration Example:\n"));
      console.log(pc.dim("  // Import the generated SDK"));
      console.log(pc.bold("  import { " + selectedProvider + "SDK } from \"./synapse-sdk/" + selectedProvider + "\";"));
      console.log("");
      console.log(pc.dim("  // Create a client"));
      console.log(pc.bold("  const client = new " + selectedProvider + "SDK();"));
      console.log(pc.bold("  const output = await client." + selectedIntent + "({\n    // your input\n  });"));
      console.log("");
      console.log(pc.dim("  // Zero dependencies, uses built-in fetch."));
      console.log(pc.dim("  // No @synapse-router/* runtime required."));
      break;
    case "playground": {
      const playgroundUrl = "http://localhost:5173";
      console.log(pc.cyan("\n  Opening Playground: " + playgroundUrl));
      const { execSync } = await import("node:child_process");
      try {
        if (process.platform === "darwin") execSync("open \"" + playgroundUrl + "\"");
        else if (process.platform === "win32") execSync("start \"\" \"" + playgroundUrl + "\"");
        else execSync("xdg-open \"" + playgroundUrl + "\"");
        console.log(pc.green("  Playground opened in browser."));
      } catch {
        console.log(pc.dim("  Could not open browser. Visit: " + playgroundUrl));
      }
      break;
    }
    case "exit":
      console.log(pc.green("\n  Negotiation complete.\n"));
      break;
  }
}

/**
 * Show full schema table, then prompt user to select/deselect optional fields.
 * Required fields are locked (checked + disabled).
 */
async function promptFieldSelection(feature: any): Promise<string[]> {
  displayFeatureSchema(feature);
  const choices = buildFieldChoices(feature);
  // Tier: recommended -- Enter accepts all fields selected as default
  return promptCheckbox(
    pc.bold("Select input fields to include (required fields are locked):"),
    choices,
    { pageSize: 15 },
  );
}

/** Full interactive intent + provider selection flow */
async function runInteractiveNegotiation(
  packsDir: string,
  configDir: string,
  _opts: NegotiateOptions,
): Promise<void> {
  // SIGINT/SIGTERM cleanup handler (NEGO-09)
  let interrupted = false;
  const cleanup = () => {
    if (interrupted) return;
    interrupted = true;
    console.log(pc.yellow("\n\n  Interrupted. Cleaning up..."));
    console.log(pc.yellow("  No changes saved."));
    process.exit(130);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  try {
    // Step 1: Display header
    console.log(pc.bold(pc.cyan("\n  Synapse Interactive Negotiation\n")));

  // Step 2: Intent selection
  const intents = await collectAvailableIntents(packsDir);
  if (intents.length === 0) {
    console.error(
      pc.red(
        "Error: No Provider Packs found. " +
        "Install a pack first with \"synapse pack add <pack-id>\" " +
        "or place provider packs in .synapse/packs/."
      )
    );
    process.exit(1);
  }

  const intentSource = async (term: string | undefined) => {
    const filtered = term
      ? intents.filter(i => i.toLowerCase().includes(term.toLowerCase()))
      : intents;
    return filtered.map(i => ({ name: i, value: i }));
  };

  // Tier: required -- no default, user must select an intent
  const selectedIntent = await promptSearch(
    "Select an intent (type to filter):",
    intentSource,
    { pageSize: 10 },
  );

  // Step 3: Provider selection
  const providers = await collectProvidersForIntent(packsDir, selectedIntent);
  if (providers.length === 0) {
    console.error(
      pc.red(
        `Error: No providers found for intent "${selectedIntent}". ` +
        "Ensure a Provider Pack supporting this intent is installed."
      )
    );
    process.exit(1);
  }

  const providerChoices = providers.map(p => ({
    name: `${p.providerId} — ${p.providerName}`,
    value: p.providerId,
  }));
  // Tier: required -- no default, user must select a provider
  const selectedProvider = await promptSelect(
    pc.bold(`Select a provider for "${selectedIntent}":`),
    providerChoices,
    { pageSize: 10 },
  );

  // Step 4: Load provider card and validate feature
  const found = await loadProviderCard(packsDir, selectedProvider);
  if (!found) {
    console.error(
      pc.red(
        `Error: Provider pack not found for "${selectedProvider}". ` +
        `Ensure the pack is installed via "synapse pack add ${selectedProvider}".`
      )
    );
    process.exit(1);
  }
  const { card } = found;

  const feature = card.features.find(
    (f: { intent?: string; id: string }) => f.intent === selectedIntent || f.id === selectedIntent,
  );
  if (!feature) {
    console.error(
      pc.red(
        `Error: No feature found for intent "${selectedIntent}" in pack "${selectedProvider}". ` +
        `Available intents: ${card.features.map((f: any) => f.intent || f.id).join(", ")}`
      )
    );
    process.exit(1);
  }

  // Step 5: Transition marker
  console.log(pc.dim(`\n  Provider: ${selectedProvider}  Intent: ${selectedIntent}\n`));

  // ── Step 6: Schema display + field selection ────────────────────────
  console.log(pc.bold(pc.cyan("\n  Step 2: Review Schema & Select Fields\n")));
  const selectedFields = await promptFieldSelection(feature);
  console.log(pc.dim("\n  Selected " + selectedFields.length + " field(s)\n"));

  // ── Step 7: LLM Key Detection ──────────────────────────────────────
  let llmApiKey: string | undefined;

  // Check vault first (key name: "negotiator-llm")
  try {
    const vault = createVault({ vaultDir: join(homedir(), ".synapse", "keys") });
    llmApiKey = (await vault.getKey("negotiator-llm")) ?? undefined;
  } catch {
    // Vault not initialized
  }

  // Fall back to env var
  if (!llmApiKey) {
    llmApiKey = process.env.OPENAI_API_KEY || undefined;
  }

  // Fall back to config
  const mergedConfig = await loadMergedConfig();
  if (!llmApiKey) {
    llmApiKey = (mergedConfig as any).negotiator?.apiKey as string | undefined;
  }

  if (!llmApiKey) {
    console.log(pc.bold(pc.yellow("\n  ⚠  No LLM API Key configured for negotiation.")));
    console.log(pc.dim("  Without an LLM key, the schema will be generated using a deterministic stub."));
    console.log(pc.dim("  This produces a generic placeholder, not a real negotiation result."));
    console.log("");
    console.log(pc.cyan("  To configure an LLM key:"));
    console.log(pc.dim("    synapse vault set negotiator-llm <your-api-key>"));
    console.log(pc.dim("  Or set: export OPENAI_API_KEY=<your-key>"));
    console.log("");

    // Tier: contextual -- only shown when no LLM key detected
    const continueStub = await promptConfirm("Continue with deterministic stub?", { defaultVal: true });
    if (!continueStub) {
      console.log(pc.dim("\n  Negotiation cancelled.\n"));
      process.exit(0);
    }
  }

  // ── Step 8: Build negotiateAndVerify input ─────────────────────────
  const input: NegotiateAndVerifyInput = {
    task: (feature as any).description ?? `Execute ${selectedIntent} for ${selectedProvider}`,
    goal: `Provide ${selectedIntent} functionality via ${selectedProvider}`,
    constraints: { selectedFields },
    providerId: selectedProvider,
    packDir: found.dir,
    llmOptions: llmApiKey ? {
      apiKey: llmApiKey,
      model: (mergedConfig as any).negotiator?.model as string | undefined,
      baseUrl: (mergedConfig as any).negotiator?.baseUrl as string | undefined,
    } : undefined,
  };

  // ── Step 9: Run negotiation pipeline ───────────────────────────────
  console.log(pc.dim("\n  Running negotiation pipeline...\n"));
  let result: NegotiationResult;
  try {
    result = await negotiateAndVerify(input);
  } catch (err: unknown) {
    // Handle ContractVerificationError with structured output
    if (err && typeof err === "object" && "status" in err && "suggestions" in err) {
      const cvErr = err as ContractVerificationError;
      console.error(`Negotiation failed: ${cvErr.status}`);
      if (cvErr.manifest_diff) {
        console.error(`  Missing fields:    ${cvErr.manifest_diff.missing.join(", ") || "none"}`);
        console.error(`  Extra fields:      ${cvErr.manifest_diff.extra.join(", ") || "none"}`);
        if (cvErr.manifest_diff.type_mismatch.length > 0) {
          for (const tm of cvErr.manifest_diff.type_mismatch) {
            console.error(`  Type mismatch:     ${tm.field} (expected ${tm.expected}, got ${tm.actual})`);
          }
        }
      }
      if (cvErr.mock_result?.error_message) {
        console.error(`  Mock test error:   ${cvErr.mock_result.error_message}`);
      }
      if (typeof cvErr.retries === "number") {
        console.error(`  Retries:           ${cvErr.retries}`);
      }
      if (cvErr.suggestions.length > 0) {
        console.error(`  Suggestions:       ${cvErr.suggestions.join("; ")}`);
      }
    } else {
      const msg = err instanceof Error ? err.message : String(err ?? "Unknown error");
      console.error(`Error: ${msg}`);
    }
    process.exit(1);
  }

  // ── Step 10: Display results ───────────────────────────────────────
  await displayNegotiationResultDetails(result, feature, card, found.dir);

  // Stub warning detection
  if (
    !llmApiKey &&
    result.schema.fields.length === 1 &&
    result.schema.fields[0].name === "input" &&
    result.schema.fields[0].type === "string"
  ) {
    console.log(pc.bold(pc.yellow("\n  ⚠  Negotiation used deterministic stub (no LLM key configured).")));
    console.log(pc.yellow("  The resulting schema is a generic placeholder, not a real negotiation."));
    console.log(pc.yellow("  To get a meaningful AI-generated schema, configure an LLM key."));
  }

  // ── Step 11: Lock diff preview + save ──────────────────────────────
  await showLockDiffPreview(selectedIntent, selectedProvider, result, configDir);

  // Tier: confirmation -- Enter accepts default (true)
  const doSave = await promptConfirm(
    pc.bold("\n  Save this Schema Lock?"),
    { defaultVal: true },
  );

  if (doSave) {
    try {
      const { lock, cached } = await getOrCreateLock({
        intent: selectedIntent,
        provider: selectedProvider,
        packDir: packsDir,
        configDir,
        card: found.card,
      });
      console.log(pc.green("\n  Lock saved: " + pc.bold(lock.lock_id)));
      if (cached) {
        console.log(pc.dim("  (Reused existing -- schema unchanged)"));
      }
    } catch (lockErr: any) {
      console.error(pc.red("  Lock save failed: " + (lockErr?.message ?? lockErr)));
    }
  } else {
    console.log(pc.dim("\n  Lock not saved. Use --dry-run for preview-only mode."));
  }

  // ── Step 12: Post-negotiation routing menu ─────────────────────────
  await promptRoutingMenu(selectedProvider, selectedIntent, result);

  // ── Cleanup signal handlers ──────────────────────────────────────
  process.removeListener("SIGINT", cleanup);
  process.removeListener("SIGTERM", cleanup);
  } catch (err: any) {
    if (err?.name === "ExitPromptError") {
      cleanup();
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Negotiation result display helper
// ---------------------------------------------------------------------------

/** Display full negotiation results in 5 sections matching non-interactive format */
async function displayNegotiationResultDetails(
  result: NegotiationResult,
  feature: any,
  card: any,
  providerPackDir: string,
): Promise<void> {
  // 1. Provider Feature
  console.log(pc.bold(pc.cyan("\n  Provider Feature")));
  console.log(`    Feature:     ${feature.name ?? feature.id}`);
  console.log(`    Description: ${(feature as any).description ?? "-"}`);
  console.log(`\n    Input fields (${feature.input.fields.length}):`);
  for (const f of feature.input.fields) {
    const req = f.required ? " (required)" : "";
    const enumInfo = (f as any).enum?.length ? ` [${(f as any).enum.join(", ")}]` : "";
    console.log(`      - ${f.name}: ${f.type}${req}${enumInfo}`);
  }
  console.log(`    Output fields (${feature.output.fields.length}):`);
  for (const f of feature.output.fields) {
    console.log(`      - ${f.name}: ${f.type}`);
  }

  // 2. Negotiated Schema
  console.log(pc.bold(pc.cyan("\n  Negotiated Schema")));
  console.log(`    Schema ID:   ${result.schema_id}`);
  console.log(`    Name:        ${result.schema.name}`);
  console.log(`    Fields:      ${result.schema.fields.length}`);
  for (const field of result.schema.fields) {
    const req = field.required ? " (required)" : "";
    const enumInfo = field.type === "enum" && field.enumValues ? ` [${field.enumValues.join(", ")}]` : "";
    console.log(`      - ${field.name}: ${field.type}${req}${enumInfo}`);
  }
  if (result.sdk_code) {
    console.log(`    SDK code:     generated (${result.sdk_code.split("\n").length} lines)`);
  }

  // 3. Manifest Match (best-effort)
  try {
    const manifestConstraints = await loadManifestFromPack(providerPackDir);
    const merged = manifestConstraints.reduce((acc: any, c: any) => {
      if (c.required) acc.required = [...new Set([...(acc.required ?? []), ...c.required])];
      if (c.type) acc.type = { ...(acc.type ?? {}), ...c.type };
      return acc;
    }, {});
    if (Object.keys(merged).length > 0) {
      const manifestMatch = matchManifest(result.schema, merged);
      console.log(pc.bold(pc.cyan("\n  Manifest Match")));
      console.log(`    Status:      ${manifestMatch.valid ? "passed" : "adapted"}`);
      if (manifestMatch.missing.length > 0) {
        console.log(`    Missing:     ${manifestMatch.missing.join(", ")}`);
      }
      if (manifestMatch.extra.length > 0) {
        console.log(`    Extra:       ${manifestMatch.extra.join(", ")}`);
      }
      if (manifestMatch.type_mismatch.length > 0) {
        for (const tm of manifestMatch.type_mismatch) {
          console.log(`    Type:        ${tm.field}: expected ${tm.expected}, got ${tm.actual}`);
        }
      }
    }
  } catch { /* manifest matching is best-effort */ }

  // 4. Field Mappings
  console.log(pc.bold(pc.cyan("\n  Field Mappings")));
  console.log(`    Count:       ${feature.field_mappings.length}`);
  for (const fm of feature.field_mappings) {
    const req = fm.required ? " (required)" : "";
    const xfrm = fm.transform ? ` => transform: ${fm.transform}` : "";
    const fb = fm.fallback !== undefined ? ` ⤷ ${JSON.stringify(fm.fallback)}` : "";
    console.log(`    ${fm.canonical_field} ⇄ ${fm.provider_field}${req}${xfrm}${fb}`);
  }

  // 5. Example I/O
  const exampleBody: Record<string, unknown> = {};
  for (const fm of feature.field_mappings) {
    if (!fm.provider_field) continue;
    const fdef = feature.input.fields.find((f: any) => f.name === fm.provider_field);
    exampleBody[fm.provider_field] = exampleValue(fdef ?? fm, fm);
  }
  const exampleOutput: Record<string, unknown> = {};
  for (const f of feature.output.fields) {
    exampleOutput[f.name] = exampleValue(f, null);
  }
  if (Object.keys(exampleBody).length > 0 || Object.keys(exampleOutput).length > 0) {
    console.log(pc.bold(pc.cyan("\n  Example I/O")));
    if (Object.keys(exampleBody).length > 0) {
      console.log(`    POST ${(card as any).service?.base_url ?? "/api/v1/"}  (input example)`);
      console.log(`    ${JSON.stringify(exampleBody, null, 4).split("\n").join("\n    ")}`);
    }
    if (Object.keys(exampleOutput).length > 0) {
      console.log(`    Response (output example):`);
      console.log(`    ${JSON.stringify(exampleOutput, null, 4).split("\n").join("\n    ")}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Flag parsing
// ---------------------------------------------------------------------------

export function parseNegotiateArgs(rawArgs: string[]): NegotiateOptions {
  const options: NegotiateOptions = {};
  const positional: string[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--intent" && rawArgs[i + 1]) {
      options.intent = rawArgs[++i];
    } else if (arg === "--provider" && rawArgs[i + 1]) {
      options.provider = rawArgs[++i];
    } else if (arg === "--format" && rawArgs[i + 1]) {
      options.format = rawArgs[++i] as "json" | "table";
    } else if (arg === "--no-cache") {
      options.noCache = true;
    } else if (arg === "--yes") {
      options.yes = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--no-save") {
      options.noSave = true;
    } else if (arg === "--no-interactive") {
      options.noInteractive = true;
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  options.schemaFile = positional[0];
  return options;
}

// ---------------------------------------------------------------------------
// Example value generator for display
// ---------------------------------------------------------------------------

function exampleValue(fdef: { type?: string; enumValues?: string[]; fallback?: unknown } | null, fm: { fallback?: unknown } | null): unknown {
  // Use fallback if available
  if (fm?.fallback !== undefined) return fm.fallback;
  if (fdef?.fallback !== undefined) return fdef.fallback;
  // Generate from type
  if (fdef?.enumValues?.length) return fdef.enumValues[0];
  if (fdef?.type === "string") return "<value>";
  if (fdef?.type === "number") return 0;
  if (fdef?.type === "boolean") return true;
  if (fdef?.type === "array") return [];
  if (fdef?.type === "object") return {};
  return "<value>";
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

export function printNegotiateHelp(): void {
  console.log(HELP_NEGOTIATE);
}

// ---------------------------------------------------------------------------
// Main negotiation handler
// ---------------------------------------------------------------------------

export async function handleNegotiateCommand(rawArgs: string[]): Promise<void> {
  const opts = parseNegotiateArgs(rawArgs);
  const { schemaFile, intent: intentFlag, provider: providerFlag, format: formatFlag = "table", noCache } = opts;

  const packsDir = await findPacksDir();
  const configDir = join(homedir(), ".synapse");

  // Interactive mode: no flags, TTY detected
  if (!intentFlag && !providerFlag) {
    if (isInteractive()) {
      await runInteractiveNegotiation(packsDir, configDir, opts);
      return;
    }
    console.error(
      "Error: --intent and --provider required in non-interactive mode. " +
      "Use --yes for defaults or run in a TTY."
    );
    process.exit(1);
  }

  // Mode 1: --intent + --provider → negotiateAndVerify pipeline
  if (intentFlag && providerFlag) {
    // Load provider card from multiple sources (built-in packs/, local .synapse/packs/, user ~/.synapse/packs/)
    const found = await loadProviderCard(packsDir, providerFlag);
    if (!found) {
      console.error(
        `Error: Provider pack not found for "${providerFlag}". ` +
        `Ensure the pack is installed via "synapse pack add ${providerFlag}"`
      );
      process.exit(1);
    }
    const { card, dir: packSourceDir } = found;

    // Find matching feature
    const feature = card.features.find((f: any) => f.intent === intentFlag || f.id === intentFlag);
    if (!feature) {
      console.error(
        `Error: No feature found for intent "${intentFlag}" in pack "${providerFlag}". ` +
        `Available intents: ${card.features.map((f: any) => f.intent || f.id).join(", ")}`
      );
      process.exit(1);
    }

    if (noCache) {
      // Remove existing lock first
      const { LockStorage } = await import("@synapse-router/lock");
      const storage = new LockStorage(join(configDir, "schemas"));
      const locks = await storage.list();
      for (const l of locks) {
        if (l.intent === intentFlag && l.provider === providerFlag) {
          await storage.remove(l.lock_id);
          console.log(`Removed cached lock: ${l.lock_id}`);
        }
      }
    }

    // Build pack dir for DSL loading (use dir found by loadProviderCard)
    const providerPackDir = packSourceDir;

    // Build task/goal/constraints from feature
    const task = (feature as any).description ?? `Execute ${intentFlag} for ${providerFlag}`;
    const goal = `Provide ${intentFlag} functionality via ${providerFlag}`;
    const constraints: Record<string, unknown> = {};

    // Read LLM API key from vault (key name: "negotiator-llm")
    let llmApiKey: string | undefined;
    try {
      const vault = createVault({ vaultDir: join(homedir(), ".synapse", "keys") });
      llmApiKey = (await vault.getKey("negotiator-llm")) ?? undefined;
    } catch {
      // Vault may not be initialized; fall back to no key (stub mode)
    }

    // Read model and baseUrl from config
    const config = await loadMergedConfig();
    const llmModel = (config as any).negotiator?.model as string | undefined;
    const llmBaseUrl = (config as any).negotiator?.baseUrl as string | undefined;

    // Build NegotiateAndVerifyInput
    const input: NegotiateAndVerifyInput = {
      task,
      goal,
      constraints,
      providerId: providerFlag,
      packDir: providerPackDir,
      llmOptions: llmApiKey ? { apiKey: llmApiKey, model: llmModel, baseUrl: llmBaseUrl } : undefined,
    };

    try {
      const result: NegotiationResult = await negotiateAndVerify(input);

      // Display full negotiation process
      console.log(`\n━━━ Provider Feature ──────────────────────────────`);
      console.log(`  Feature:     ${feature.name ?? feature.id}`);
      console.log(`  Description: ${(feature as any).description ?? "-"}`);
      console.log(`\n  Input fields (${feature.input.fields.length}):`);
      for (const f of feature.input.fields) {
        const req = f.required ? " (required)" : "";
        const fe = (f as any).enum;
        const enumInfo = fe && fe.length ? ` [${fe.join(", ")}]` : "";
        console.log(`    - ${f.name}: ${f.type}${req}${enumInfo}`);
      }
      console.log(`  Output fields (${feature.output.fields.length}):`);
      for (const f of feature.output.fields) {
        console.log(`    - ${f.name}: ${f.type}`);
      }

      console.log(`\n━━━ Negotiated Schema ────────────────────────────`);
      console.log(`  Schema ID:   ${result.schema_id}`);
      console.log(`  Name:        ${result.schema.name}`);
      console.log(`  Fields:      ${result.schema.fields.length}`);
      for (const field of result.schema.fields) {
        const req = field.required ? " (required)" : "";
        const enumInfo = field.type === "enum" && field.enumValues ? ` [${field.enumValues.join(", ")}]` : "";
        console.log(`    - ${field.name}: ${field.type}${req}${enumInfo}`);
      }
      if (result.sdk_code) {
        const lines = result.sdk_code.split("\n").length;
        console.log(`  SDK code:     generated (${lines} lines)`);
      }

      // Run manifest matching to show field-level comparison
      try {
        const manifestConstraints = await loadManifestFromPack(providerPackDir);
        const merged = manifestConstraints.reduce((acc: any, c: any) => {
          if (c.required) acc.required = [...new Set([...(acc.required ?? []), ...c.required])];
          if (c.type) acc.type = { ...(acc.type ?? {}), ...c.type };
          return acc;
        }, {});
        if (Object.keys(merged).length > 0) {
          const manifestMatch = matchManifest(result.schema, merged);
          console.log(`\n━━━ Manifest Match ──────────────────────────────`);
          console.log(`  Status:      ${manifestMatch.valid ? "passed" : "adapted"}`);
          if (manifestMatch.missing.length > 0) {
            console.log(`  Missing:     ${manifestMatch.missing.join(", ")}`);
          }
          if (manifestMatch.extra.length > 0) {
            console.log(`  Extra:       ${manifestMatch.extra.join(", ")}`);
          }
          if (manifestMatch.type_mismatch.length > 0) {
            for (const tm of manifestMatch.type_mismatch) {
              console.log(`  Type:        ${tm.field}: expected ${tm.expected}, got ${tm.actual}`);
            }
          }
        }
      } catch { /* manifest matching is best-effort */ }

      console.log(`\n━━━ Field Mappings (${feature.field_mappings.length}) ───────────────────`);
      for (const fm of feature.field_mappings) {
        const req = fm.required ? " (required)" : "";
        const xfrm = fm.transform ? ` => transform: ${fm.transform}` : "";
        const fb = fm.fallback !== undefined ? ` ⤵ ${JSON.stringify(fm.fallback)}` : "";
        console.log(`    ${fm.canonical_field} ⇄ ${fm.provider_field}${req}${xfrm}${fb}`);
      }

      // Show example API call from feature definition
      const exampleBody: Record<string, unknown> = {};
      for (const fm of feature.field_mappings) {
        const fdef = feature.input.fields.find((f: any) => f.name === fm.provider_field);
        exampleBody[fm.provider_field] = exampleValue(fdef ?? fm, fm);
      }
      const exampleOutput: Record<string, unknown> = {};
      for (const f of feature.output.fields) {
        exampleOutput[f.name] = exampleValue(f, null);
      }
      const exLines = Object.keys(exampleBody).length;
      const outLines = Object.keys(exampleOutput).length;
      if (exLines > 0 || outLines > 0) {
        console.log(`\n━━━ Example I/O ───────────────────────────────────`);
        if (exLines > 0) {
          console.log(`  POST ${(card as any).service?.base_url ?? "/api/v1/"}  (input example)`);
          console.log(`  ${JSON.stringify(exampleBody, null, 4).split("\n").join("\n  ")}`);
        }
        if (outLines > 0) {
          console.log(`  Response (output example):`);
          console.log(`  ${JSON.stringify(exampleOutput, null, 4).split("\n").join("\n  ")}`);
        }
      }

      console.log(`\n━━━ Verification ──────────────────────────────────`);
      console.log(`  Status:      ${result.verification_result.status}`);
      if ((result.schema as any).llm_provider) {
        console.log(`  LLM:         ${(result.schema as any).llm_provider}`);
      }
      console.log(``);

      // Auto-save Schema Lock (skipped for --dry-run or --no-save)
      let lockInfo: { lock_id: string; status: string } | null = null;
      if (opts.dryRun) {
        console.log("\n[Dry run — Lock not saved. Re-run without --dry-run to save.]");
      } else if (opts.noSave) {
        console.log("\n[Lock not saved. Re-run without --no-save to persist the Schema Lock.]");
      } else {
        try {
          const { lock, cached } = await getOrCreateLock({
            intent: intentFlag,
            provider: providerFlag,
            packDir: packsDir,  // parent packs/ directory
            configDir,
            card,
          });
          lockInfo = { lock_id: lock.lock_id, status: cached ? "reused" : "created" };
          console.log(`  Lock:         ${lock.lock_id} (${lockInfo.status})`);
        } catch (lockErr: any) {
          console.error(`  Lock save:    failed (${lockErr.message})`);
        }
      }

      // --format json output
      if (formatFlag === "json") {
        const output: Record<string, unknown> = {
          schema: result.schema,
          schema_id: result.schema_id,
          verification: result.verification_result,
          sdk_code_lines: result.sdk_code ? result.sdk_code.split("\n").length : 0,
        };
        if (lockInfo) {
          output.lock = lockInfo;
        }
        console.log(JSON.stringify(output, null, 2));
      }
    } catch (err: unknown) {
      // Handle ContractVerificationError with structured output
      if (err && typeof err === "object" && "status" in err && "suggestions" in err) {
        const cvErr = err as ContractVerificationError;
        console.error(`Negotiation failed: ${cvErr.status}`);
        if (cvErr.manifest_diff) {
          console.error(`  Missing fields:    ${cvErr.manifest_diff.missing.join(", ") || "none"}`);
          console.error(`  Extra fields:      ${cvErr.manifest_diff.extra.join(", ") || "none"}`);
          if (cvErr.manifest_diff.type_mismatch.length > 0) {
            for (const tm of cvErr.manifest_diff.type_mismatch) {
              console.error(`  Type mismatch:     ${tm.field} (expected ${tm.expected}, got ${tm.actual})`);
            }
          }
        }
        if (cvErr.mock_result?.error_message) {
          console.error(`  Mock test error:   ${cvErr.mock_result.error_message}`);
        }
        if (typeof cvErr.retries === "number") {
          console.error(`  Retries:           ${cvErr.retries}`);
        }
        if (cvErr.suggestions.length > 0) {
          console.error(`  Suggestions:       ${cvErr.suggestions.join("; ")}`);
        }
      } else {
        const msg = err instanceof Error ? err.message : String(err ?? "Unknown error");
        console.error(`Error: ${msg}`);
      }
      process.exit(1);
    }
    return;
  }

  // Mode 2: schema file → legacy behavior (match features)
  if (!schemaFile) {
    console.error("Error: schema file or --intent + --provider required");
    printNegotiateHelp();
    process.exit(1);
  }

  let agentSchema: { features?: Array<{ intent?: string }> };
  try {
    const content = await readFile(schemaFile, "utf8");
    agentSchema = JSON.parse(content);
  } catch (err) {
    console.error(`Error reading schema file: ${err}`);
    process.exit(1);
  }

  console.log("Matched providers:");
  let found = false;

  // Collect unique provider directories from all pack sources
  const seen = new Set<string>();
  for (const dir of [packsDir, LOCAL_PACKS_DIR(), USER_PACKS_DIR]) {
    let dirEntries;
    try {
      dirEntries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // directory doesn't exist, skip
    }
    for (const entry of dirEntries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      if (seen.has(entry.name)) continue;
      seen.add(entry.name);

      const cardPath = join(dir, entry.name, "provider-card.json");
      try {
        const card = JSON.parse(await readFile(cardPath, "utf8"));
        const features: Array<{ id?: string; intent?: string }> = card.features ?? [];
        const matchedFeatures = features.filter((f) =>
          agentSchema.features?.some((af) => af.intent === f.intent)
        );
        if (matchedFeatures.length > 0) {
          console.log(`  ${card.provider.id}: ${matchedFeatures.map((f) => f.id).join(", ")}`);
          found = true;
        }
      } catch {
        // skip
      }
    }
  }
  if (!found) {
    console.log("  (no matching providers found)");
  }
}
