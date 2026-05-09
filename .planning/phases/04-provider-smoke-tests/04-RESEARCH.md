# Phase 4: Provider Smoke Tests — Research

**Researched:** 2026-05-08
**Domain:** CLI command + live API integration testing via connector layer
**Confidence:** HIGH

## Summary

This phase adds a `synapse smoke --provider <name>` CLI command that exercises real OpenAI and Replicate production APIs through the existing `@synapse-router/connector` layer. The smoke tests call `connector.connect()` — the same code path used by `synapse connect` — and report structured PASS/SKIP/FAIL results per provider.

Three findings significantly affect implementation design:

1. **Replicate predictions API is async** — POST `/v1/predictions` returns immediately with `{status: "starting"}` and an `id`. The final output requires polling (`GET /v1/predictions/{id}`). The connector does only one HTTP call, so the smoke test checks the initial response shape (`id`, `status` present) rather than final output. This is sufficient for a connectivity smoke test but is a notable behavioral difference from the synchronous OpenAI flow.

2. **No timeout mechanism in connector** — `connector.connect()` and `callProvider()` do not accept an `AbortSignal`. The smoke test must wrap `connect()` in a `Promise.race` with a timer to implement `--timeout`. This does NOT abort the in-flight HTTP request (native fetch supports it, but the connector does not pass a signal through), so timed-out tests may still produce side effects.

3. **formatOutput from connect.ts is not reusable for smoke results** — it renders `ConnectResult` types. Smoke output is a different shape (per-provider PASS/SKIP/FAIL with latency). A new `formatSmokeOutput()` function is needed, but should follow the same json/table/compact pattern.

**Primary recommendation:** Build lock objects from provider-card.json feature definitions, bypassing the negotiate/getOrCreateLock flow. Smoke tests know exactly what feature and provider they test — constructing the ConnectLock inline from the pack avoids negotiation overhead and dependency on `@synapse-router/lock`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Decisions

#### Test Framework Architecture
- **D-01:** Use `connector.connect()` layer — smoke tests exercise the same code path as production `synapse connect`, including field mapping, HTTP call, and auth. Catches regressions in mapping/auth/HTTP layers.
- **D-02:** Framework lives in `apps/cli/src/commands/smoke.ts` — consistent with other CLI commands. Not a separate package.
- **D-03:** One `runSmokeTest()` function per provider. OpenAI -> `runOpenAiSmoke()`, Replicate -> `runReplicateSmoke()`. Simple to maintain, easy to add providers.

#### CLI Smoke Command Design
- **D-04:** `--provider` is required — `synapse smoke --provider openai`. Running without `--provider` is an error. Prevents accidentally hitting production APIs.
- **D-05:** Supported flags: `--provider <name>`, `--timeout <seconds>` (default 30s), `--format <json|table|compact>`, `--verbose / -v`. Matches `synapse connect` output pattern.

#### Test Case Scope per Provider
- **D-06:** OpenAI: simple chat completion test with `gpt-4o-mini`. Send basic 'Hello' message, verify HTTP 200 + response shape.
- **D-07:** Replicate: predefined model version (e.g., `stability-ai/sdxl`) with fixed input. Version hard-coded in test config.
- **D-08:** Verify response shape beyond HTTP 200 — check key fields exist (OpenAI: `choices[0].message.content`, Replicate: `output`).

### Claude's Discretion
- API key resolution: vault by default, `--api-key` flag for override
- Skip handling: when API key is missing for a provider, print clear skip message (not a failure)
- Pass/fail determination: HTTP 200 + response shape check
- Timeout: default 30s per provider test, configurable via `--timeout`
- Error display: structured output showing pass/skip/fail per provider
- Output format implementation: follow `connect.ts` `formatOutput()` pattern

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SMOKE-01 | Smoke test framework (API key injection, timeout, skip) | API key: vault.getKey(provider) with --api-key fallback. Timeout: Promise.race wrapper. Skip: graceful exit when vault.getKey returns null. All patterns verified in connect.ts and vault package. |
| SMOKE-02 | OpenAI chat completions smoke test | Connector.connect() with chat lock built from openai provider-card.json feature `chat_post_v1_chat_completions`. Response shape check: `result.raw` has `choices[0].message.content`. |
| SMOKE-03 | Replicate smoke test | Connector.connect() with predictions lock built from replicate provider-card.json feature `predictions_post_v1_predictions`. Response shape check: `result.raw` has `id` and `status` fields. |
| SMOKE-04 | CLI command `synapse smoke --provider <name>` | Add `case "smoke"` in index.ts switch, import handleSmokeCommand, register in help system. Pattern matches existing `case "connect"` handler. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@synapse-router/connector` | workspace:* | Primary test execution path — calls live provider API | D-01: smoke tests exercise connector.connect() to catch mapping/auth/HTTP regressions |
| `@synapse-router/vault` | workspace:* | API key resolution (encrypted storage) | Existing vault.getKey(provider) pattern from connect.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs/promises` | builtin | Read provider-card.json for constructing ConnectLock | Each smoke test invocation |
| `node:path` | builtin | Packs directory resolution | Import.meta.url path traversal for packs/ |
| `node:os` (homedir) | builtin | ~/.synapse/keys vault directory | Key resolution |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| connector.connect() | Raw fetch per provider | Bypasses field_mapping, auth header logic — misses regressions. D-01 rejects this. |
| apps/cli/src/commands/smoke.ts | packages/smoke-test/ | Separate package adds build overhead. D-02: keep in CLI commands/ |
| One runSmokeTest per provider | Individual test funcs per endpoint | Simpler to maintain. D-03: one func per provider. |

## Architecture Patterns

### System Architecture Diagram

```
User runs: synapse smoke --provider openai
                    |
                    v
            index.ts (switch case "smoke")
                    |
                    v
         handleSmokeCommand(argv)
              |              |
              v              v
     parseSmokeArgs()     printSmokeHelp() (if --help)
              |
              v
      Resolve API key: --api-key flag > vault.getKey(provider)
              |
              +-- key found? --> continue
              +-- key missing? --> print "SKIP: No API key for <provider>", exit 0
              |
              v
      Build ConnectLock from provider-card.json:
          1. loadProviderCard(packsDir, providerId)
          2. Find matching feature by id
          3. Construct lock with feature's field_mappings
              |
              v
      Build ConnectParams:
          { lock, input, connection: { base_url, api_key, auth_type } }
              |
              v
      Call connector.connect(params) with Promise.race timeout
              |
              v
      Check result:
          - No error thrown? -> PASS + response shape verification
          - ConnectorHttpError? -> FAIL + status code
          - Timeout? -> FAIL + timeout message
          - Other error? -> FAIL + error details
              |
              v
      formatSmokeOutput(results, format)
              |
              v
      Print formatted result to stdout
```

### Recommended Project Structure

The smoke test lives in the existing CLI commands directory. No new directories needed.

```
apps/cli/src/
├── index.ts                   # Add "smoke" case to switch, import handleSmokeCommand
└── commands/
    ├── connect.ts              # Reference implementation (do not modify)
    ├── smoke.ts                # NEW FILE: handleSmokeCommand + parseSmokeArgs + formatSmokeOutput + runOpenAiSmoke + runReplicateSmoke
    └── ...
```

### Pattern 1: Handle Command + Parse Args + Format Output

**What:** Every CLI command follows the same three-function pattern established by connect.ts.

**When to use:** For the `smoke` command — copies the exact pattern from connect.ts.

**Example (from connect.ts — do NOT copy verbatim, adapt for smoke):**

The connect command exports:
- `handleConnectCommand(argv)` — main entry point
- `parseConnectArgs(argv)` — returns typed options object
- `printConnectHelp()` — prints help text
- `formatOutput(result, format, raw)` — formats result as json/table/compact

The smoke command should export:
- `handleSmokeCommand(argv)` — main entry point
- `parseSmokeArgs(argv)` — returns `SmokeOptions { provider, timeout, format, verbose, apiKey }`
- `printSmokeHelp()` — prints help text
- `formatSmokeOutput(results, format, verbose)` — formats SmokeResult[] as json/table/compact

**Key difference:** formatOutput in connect.ts renders a single ConnectResult. formatSmokeOutput renders an array of SmokeResult (PASS/SKIP/FAIL per test case).

### Pattern 2: Build ConnectLock from Provider Card (Bypass Negotiate)

**What:** Smoke tests know exactly what feature and provider they test, so they construct ConnectLock inline from provider-card.json instead of going through negotiation.

**Why:** Connector.connect() requires a ConnectLock. The negotiate flow (getOrCreateLock) is heavyweight and adds `@synapse-router/lock` dependency. For smoke tests, we skip it entirely by building the lock directly from the provider card's feature definition.

**Example flow:**
```typescript
// In runOpenAiSmoke():
const card = await loadProviderCard(packsDir, "openai");
const feature = card.features.find(f => f.id === "chat_post_v1_chat_completions");
const lock: ConnectLock = {
  intent: feature.intent,
  provider: "openai",
  feature_id: feature.id,
  input_schema: feature.input as ConnectLock["input_schema"],
  output_schema: feature.output as ConnectLock["output_schema"],
  field_mappings: (feature.field_mappings ?? []) as ConnectLock["field_mappings"],
};
```

**Risk:** The ConnectLock's input_schema and output_schema types require specific shapes. The cast `as ConnectLock["input_schema"]` is used in connect.ts line 576-581.

### Pattern 3: Timeout via Promise.race Wrapper

**What:** Since connector.connect() does not accept AbortSignal, implement timeout via Promise.race with a timer.

**Why:** Adding AbortSignal support to the connector would require changing the connector package API and types, which is out of scope for a CLI smoke test command.

```typescript
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms: ${label}`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}
```

### Anti-Patterns to Avoid
- **Using negotiate/getOrCreateLock to build ConnectLock:** Adds unnecessary dependency and network negotiation. Smoke tests know the feature and provider. Build the lock inline from the provider card.
- **Sharing formatOutput from connect.ts:** It renders ConnectResult (has `output`, `raw`, `meta`). Smoke output is SmokeResult (has `provider`, `status`, `latency`, `detail`). Write a separate formatSmokeOutput.
- **Hardcoding base_urls:** Load from provider-card.json instead. Keeps tests aligned with pack definitions. Exception: Replicate test input (model version) is hardcoded per D-07.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API key resolution | Custom key file parser | vault.getKey(provider) with --api-key fallback | Already implemented, handles encryption/OS keychain. connect.ts pattern at line 492-501. |
| HTTP call to provider | Raw fetch | connector.connect() | Already handles field mapping, auth header injection, URL construction. D-01 mandates this. |
| Provider card loading | Custom pack scanning | loadProviderCard from connect.ts (extract to shared helper) | Already handles packs/ and ~/.synapse/packs/ directories. Export this helper or duplicate it in smoke.ts. |
| Structured error from HTTP | Custom error class | ConnectorHttpError from @synapse-router/connector | Already captures status, statusText, body. Thrown by callProvider on non-2xx. |

**Key insight:** The connector layer already solves the hard problems (field mapping, auth, URL construction). The smoke test's job is to wire it up with known test inputs and verify the response shape. Every line of custom HTTP code in the smoke test is a missed opportunity to catch regressions in the connector layer.

## Common Pitfalls

### Pitfall 1: Timeout Without Abort
**What goes wrong:** When --timeout fires, the Promise.race rejects but the in-flight fetch continues. For providers with rate limits, the "orphaned" request may count against quota.
**Why it happens:** connector.connect() does not pass AbortSignal to fetch.
**How to avoid:** Accept this limitation. Document in --help that --timeout may not abort the in-flight request. For a smoke test (not a load test), this is acceptable.
**Warning signs:** Rate limit errors when running smoke tests back-to-back against the same provider.

### Pitfall 2: Response Shape Assumptions Between Providers
**What goes wrong:** OpenAI returns `choices[0].message.content` synchronously. Replicate returns `{id, status: "starting"}` — it never has `output` in the initial response.
**Why it happens:** OpenAI chat completions is synchronous; Replicate predictions are async.
**How to avoid:** Shape checks must be provider-specific. OpenAI checks `choices[0].message.content`. Replicate checks `id` and `status` exist (not `output`).
**Warning signs:** Replicate smoke test always passes because `output` is checked in initial response (it will never be there).

### Pitfall 3: Importing connect.ts Internal Helpers
**What goes wrong:** loadProviderCard and findPacksDir are local functions in connect.ts. They are NOT exported. Importing them from smoke.ts fails.
**Why it happens:** connect.ts defines these as module-private functions.
**How to avoid:** Either export them from connect.ts (and export from commands/connect.ts), or duplicate them in smoke.ts. Given both files are in the same CLI package, duplication of approximately 20 lines is acceptable and avoids interface coupling.

### Pitfall 4: Skipping Provider Card Loading (Hardcoding Values)
**What goes wrong:** Hardcoding base_url and auth_type means tests silently diverge from pack definitions. When the OpenAI pack updates, the hardcoded test continues passing with stale values.
**Why it happens:** It is easier to hardcode.
**How to avoid:** Always load provider-card.json for base_url and auth_type. The model version and input payload are legitimately hardcoded (D-07), but connection metadata comes from the pack.

### Pitfall 5: formatOutput Trying to Handle ConnectResult
**What goes wrong:** Copying formatOutput from connect.ts and passing SmokeResult[] through it produces confusing output.
**Why it happens:** The connect.ts formatOutput expects `{output, raw, meta}`. Smoke results have `{provider, status, latency_ms, detail}`.
**How to avoid:** Write a dedicated formatSmokeOutput that handles the three formats (json, table, compact) for the smoke result shape. Follow the same output style conventions (json=full, table=columnar with Status/Provider/Latency/Detail, compact=one-liner per provider).

## Code Patterns to Replicate

### 1. CLI Command Registration (index.ts)

This pattern from index.ts lines 772-810 shows how commands are registered:

```typescript
// In index.ts imports:
import { handleSmokeCommand, printSmokeHelp } from "./commands/smoke.js";

// In the switch/case (add around line 858):
case "smoke":
  if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
    printSmokeHelp();
  } else {
    await handleSmokeCommand(rawArgs);
  }
  break;
```

**Source:** `apps/cli/src/index.ts` lines 803-809 — the `case "connect":` block is the exact pattern.

### 2. Packs Directory Resolution (connect.ts lines 407-420)

```typescript
// In smoke.ts -- same path calculation as connect.ts (same directory depth):
const { fileURLToPath } = await import("node:url");
let packsDir: string;
try {
  const dir = fileURLToPath(import.meta.url);
  if (dir.includes("/dist/")) {
    packsDir = join(dirname(dirname(dirname(dirname(dirname(dir))))), "packs");
  } else {
    // From src/commands/smoke.ts -> 4 levels up = project root
    packsDir = join(dirname(dirname(dirname(dirname(dir)))), "packs");
  }
} catch {
  packsDir = join(process.cwd(), "packs");
}
```

**Source:** `apps/cli/src/commands/connect.ts` lines 407-420. Same level (commands/) so same path calculation.

### 3. API Key Resolution (connect.ts lines 492-501)

```typescript
let apiKey = options.apiKey ?? "";
if (!apiKey) {
  const vault = createVault({ vaultDir: join(homedir(), ".synapse", "keys") });
  apiKey = (await vault.getKey(provider)) ?? "";
}

// Smoke test difference: instead of process.exit(1) on missing key:
if (!apiKey) {
  return { provider: "openai", status: "SKIP" as const, detail: "No API key for openai", latency_ms: 0 };
}
```

**Source:** `apps/cli/src/commands/connect.ts` lines 492-501. Adapted for SKIP behavior.

### 4. Provider Card Loading (connect.ts lines 106-118)

```typescript
const USER_PACKS_DIR = join(homedir(), ".synapse", "packs");

async function loadProviderCard(packsDir: string, providerId: string): Promise<ProviderCard | null> {
  for (const dir of [packsDir, USER_PACKS_DIR]) {
    const cardPath = join(dir, providerId, "provider-card.json");
    try {
      const content = await readFile(cardPath, "utf8");
      return JSON.parse(content);
    } catch {
      continue;
    }
  }
  return null;
}
```

**Source:** `apps/cli/src/commands/connect.ts` lines 106-118. Duplicate in smoke.ts.

### 5. Connector Auth Header Logic (connector/src/index.ts lines 42-52)

This shows how the connector handles auth_type. The smoke test does NOT implement this — it delegates to connector. But understanding it is critical for debugging:

```typescript
switch (connection.auth_type) {
  case "Bearer":      headers["Authorization"] = `Bearer ${connection.api_key}`; break;
  case "APIKey":      headers["X-API-Key"] = connection.api_key; break;
  case "OAuth2":      headers["Authorization"] = `Bearer ${connection.api_key}`; break;
}
```

Both OpenAI and Replicate use `"Bearer"` auth_type (from their provider-card.json `service.auth_type`).

**Source:** `packages/connector/src/index.ts` lines 42-52.

### 6. ConnectorHttpError Pattern (connector/src/http.ts lines 45-75)

The connector throws `ConnectorHttpError` on non-2xx. Smoke test should catch it:

```typescript
import { ConnectorHttpError } from "@synapse-router/connector";

try {
  const result = await connect(params);
  // PASS path
} catch (err) {
  if (err instanceof ConnectorHttpError) {
    return { provider, status: "FAIL" as const, detail: `HTTP ${err.status}: ${err.statusText}`, latency_ms: elapsed };
  }
  return { provider, status: "FAIL" as const, detail: String(err), latency_ms: elapsed };
}
```

**Source:** `packages/connector/src/http.ts` lines 45-75 for error class; `packages/connector/src/index.test.ts` lines 354-378 for test pattern.

## OpenAI Smoke Test Design

### Test Flow

1. Build ConnectLock from `packs/openai/provider-card.json` feature `chat_post_v1_chat_completions`
2. Extract `base_url`, `auth_type` from the card's `service` object
3. Resolve API key (vault -> --api-key flag)
4. Construct input payload:
   ```json
   {
     "prompt": [{"role": "user", "content": "Hello"}],
     "model": "gpt-4o-mini"
   }
   ```
5. Call `connect({ lock, input, connection: { base_url, api_key, auth_type } })` wrapped in `withTimeout(promise, timeoutMs, "openai chat")`
6. Verify:

**PASS conditions (all must hold):**
- No ConnectorHttpError thrown (implies HTTP 2xx)
- `result.raw` is an object
- `(result.raw as any).choices` is an array with length > 0
- `(result.raw as any).choices[0].message.content` is a non-empty string

**If ConnectorHttpError caught:**
- FAIL with detail `HTTP {status}: {statusText}`

**If timeout:**
- FAIL with detail `Timeout after {timeout}s`

### Expected Response Shape (from OpenAI API)

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1715070000,
  "model": "gpt-4o-mini",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Hello! How can I assist you today?" },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 10, "completion_tokens": 7, "total_tokens": 17 }
}
```

### ConnectLock Construction

```typescript
const openaiLock: ConnectLock = {
  intent: "chat",
  provider: "openai",
  feature_id: "chat_post_v1_chat_completions",
  input_schema: {
    fields: [
      { name: "messages", type: "array", required: true },
      { name: "model", type: "string", required: true },
      { name: "temperature", type: "number", required: false },
      // ... full field set from provider-card.json
    ],
  },
  output_schema: {
    fields: [
      { name: "id", type: "string" },
      { name: "object", type: "string" },
      { name: "created", type: "number" },
      { name: "model", type: "string" },
      { name: "choices", type: "array" },
      { name: "usage", type: "object" },
    ],
  },
  field_mappings: [
    { canonical_field: "prompt", provider_field: "messages", required: true },
    { canonical_field: "model", provider_field: "model", required: true },
    { canonical_field: "temperature", provider_field: "temperature", required: false, fallback: 0.7 },
    { canonical_field: "max_tokens", provider_field: "max_tokens", required: false, fallback: 1024 },
    // ... full mapping set from provider-card.json
  ],
};
```

**Key schema detail:** The connector maps `prompt` (canonical field) to `messages` (provider field) via `field_mappings`. Smoke input uses `prompt` as key; the connector transforms it to `messages` before sending the HTTP request. The mapped value (`[{role: "user", content: "Hello"}]`) becomes the HTTP body field `messages`.

### Connection Parameters (from provider-card.json service section)

```
base_url: "https://api.openai.com/v1"
auth_type: "Bearer"
```

Resulting HTTP call: `POST https://api.openai.com/v1/chat/completions` with `Authorization: Bearer sk-...`

## Replicate Smoke Test Design

### Test Flow

1. Build ConnectLock from `packs/replicate/provider-card.json` feature `predictions_post_v1_predictions`
2. Extract `base_url`, `auth_type` from the card's `service` object
3. Resolve API key (vault -> --api-key flag)
4. Construct input payload (canonical field names):
   ```json
   {
     "model_version": "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c71a94d2b0c6d7e8f9a0b1c2d3e4f5a6b7c",
     "input": { "prompt": "A cute cat" }
   }
   ```
   The `model_version` maps to the `version` provider field via `field_mappings`. The `input` field passes through directly.
5. Call `connect({ lock, input, connection })` wrapped in `withTimeout(promise, timeoutMs, "replicate predict")`
6. Verify:

**PASS conditions (all must hold):**
- No ConnectorHttpError thrown (implies HTTP 2xx)
- `result.raw` is an object
- `(result.raw as any).id` is a non-empty string (prediction ID returned)
- `(result.raw as any).status` is a string (expected: "starting" or "processing")

**Important:** `(result.raw as any).output` will be `null` in the initial response. Do NOT check for `output`. The Replicate prediction is async; the initial POST response contains the prediction metadata, not the result.

### Expected Response Shape (initial POST response)

```json
{
  "id": "p1a2b3c4d5e6f7g8h9i0j1k2",
  "model": "stability-ai/sdxl",
  "version": "39ed52f2a78e934b3ba6e2a89f5b1c71a94d2b0c6d7e8f9a0b1c2d3e4f5a6b7c",
  "input": { "prompt": "A cute cat" },
  "logs": "",
  "output": null,
  "error": null,
  "status": "starting",
  "created_at": "2026-05-08T00:00:00.000Z"
}
```

### ConnectLock Construction

```typescript
const replicateLock: ConnectLock = {
  intent: "inference",
  provider: "replicate",
  feature_id: "predictions_post_v1_predictions",
  input_schema: {
    fields: [
      { name: "version", type: "string", required: true },
      { name: "input", type: "object", required: true },
    ],
  },
  output_schema: {
    fields: [
      { name: "id", type: "string" },
      { name: "status", type: "string" },
      { name: "output", type: "object" },
      { name: "error", type: "string" },
      { name: "logs", type: "string" },
    ],
  },
  field_mappings: [
    { canonical_field: "model_version", provider_field: "version", required: true },
    { canonical_field: "input", provider_field: "input", required: true },
  ],
};
```

### Connection Parameters (from provider-card.json service section)

```
base_url: "https://api.replicate.com/v1"
auth_type: "Bearer"
```

Resulting HTTP call: `POST https://api.replicate.com/v1/predictions` with `Authorization: Bearer r8_...`

### Model Version Selection

For reproducibility, pick a well-known stable model version. The SDXL model has a fixed version hash.

- Recommended: `stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c71a94d2b0c6d7e8f9a0b1c2d3e4f5a6b7c`
- This is a placeholder — the planner must verify which version is stable as of May 2026 by querying `GET https://api.replicate.com/v1/models/stability-ai/sdxl/versions` with a valid API key or checking recent Replicate documentation.

## CLI Integration Points

### Files to Modify

| File | Change | Pattern |
|------|--------|---------|
| `apps/cli/src/index.ts` line ~9 (imports) | Add `import { handleSmokeCommand, printSmokeHelp } from "./commands/smoke.js";` | Matches existing imports for other commands (e.g., line 9: `import { handleConnectCommand, printConnectHelp }`) |
| `apps/cli/src/index.ts` switch/case (around line 858) | Add `case "smoke":` block calling `handleSmokeCommand(rawArgs)` | Matches `case "connect":` at lines 803-809 |
| `apps/cli/src/index.ts` printHelp() (around line 93) | Add `smoke --provider <name>     Run provider smoke tests` | Consistent with other help text entries |
| `apps/cli/src/index.ts` help subcommand handler (around line 765) | Add `case "smoke": printSmokeHelp(); return;` | Matches other cases in the `synapse help <subcommand>` handler |

### Files to Create

| File | Purpose |
|------|---------|
| `apps/cli/src/commands/smoke.ts` | HandleSmokeCommand, parseSmokeArgs, printSmokeHelp, formatSmokeOutput, runOpenAiSmoke, runReplicateSmoke |

### No Other Files Need Modification

The smoke command does not modify:
- `packages/connector/` — used as-is via import
- `packages/vault/` — used as-is via import
- Any provider pack — packs are read-only
- Any existing command — no shared state

## Error Handling Patterns

### Pass Pattern (successful response)

```typescript
// No ConnectorHttpError thrown, response shape verified
{
  provider: "openai",
  status: "PASS",
  latency_ms: 1234,
  detail: "chat completed: 20 tokens",
}
```

### Fail Pattern (HTTP error from provider)

```typescript
// ConnectorHttpError caught
{
  provider: "openai",
  status: "FAIL",
  latency_ms: 0,
  detail: "HTTP 401: Unauthorized -- https://api.openai.com/v1/chat/completions: ...",
}
```

### Fail Pattern (timeout)

```typescript
// Timeout error from Promise.race
{
  provider: "replicate",
  status: "FAIL",
  latency_ms: 30000,
  detail: "Timeout after 30000ms: replicate predict",
}
```

### Fail Pattern (response shape invalid)

```typescript
// HTTP 200 but response does not have expected fields
{
  provider: "openai",
  status: "FAIL",
  latency_ms: 1234,
  detail: "Missing choices[0].message.content in response",
}
```

### Skip Pattern (no API key)

```typescript
// vault.getKey returned null and no --api-key provided
{
  provider: "openai",
  status: "SKIP",
  latency_ms: 0,
  detail: "No API key for openai. Use --api-key or 'synapse vault set openai <key>'",
}
```

### Output Format Examples

**JSON format:**
```json
[
  { "provider": "openai", "status": "PASS", "latency_ms": 1234, "detail": "chat completion: 27 tokens" },
  { "provider": "replicate", "status": "FAIL", "latency_ms": 0, "detail": "No API key for replicate" }
]
```

**Table format:**
```
Status  Provider   Latency  Detail
PASS    openai     1.23s    chat completion: 27 tokens
SKIP    replicate  0.00s    No API key for replicate
```

**Compact format:**
```
openai ........... PASS (1.23s)
replicate ........ SKIP (no API key)
```

## Open Questions / Risks (RESOLVED)

| # | Question | Resolution | Status |
|---|----------|------------|--------|
| Q1 | Replicate model version hash | Hardcoded as `stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c71a94d2b0c6d7e8f9a0b1c2d3e4f5a6b7c` in `runReplicateSmoke`. Planner chose a well-known SDXL version hash. Must verify at implementation time. | PLAN ADDRESSES |
| Q2 | --timeout with AbortController | Accepted. `Promise.race` wrapper (`withTimeout()`) implemented in the plan. True abort deferred to future connector enhancement. | RESOLVED |
| Q3 | --provider all support | Out of scope per D-04. `--provider` is required. | DEFERRED |
| Q4 | DRY loadProviderCard | Accept duplication. Both `connect.ts` and `smoke.ts` have ~20 line copies. Extract only if third consumer appears. | RESOLVED |
| Q5 | vault.getKey timeout | The `withTimeout` wraps only the `connect()` call, not key resolution. Vault is local filesystem I/O (OS keychain), typically ~10ms. Accepted risk. | ACCEPTED |
| Q6 | SDXL input schema | Plan hardcodes `{prompt: "..."}` plus `model_version`. SDXL accepts `prompt` as minimum. Additional fields (`negative_prompt`, `num_inference_steps`) are optional. If rejected, smoke test FAILs with clear detail. | PLAN ADDRESSES |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `loadProviderCard` from connect.ts runs correctly for both project packs/ and ~/.synapse/packs/. | Code Patterns to Replicate | If pack resolution fails, smoke tests silently skip the pack-loading step and the ConnectLock construction fails. Verified by reading connect.ts lines 106-118. |
| A2 | The connector's `connect()` function is fully implemented and does NOT throw "not yet implemented" as of Phase 4. | OpenAI Smoke Test | The connect.ts fallback (lines 607-608) checks for this. If connector is not available, the smoke command must handle gracefully. Verified: connector/src/index.ts has a complete connect() implementation. |
| A3 | `child_process` is available in the execution environment. | Vault init | vault's getMachineId uses execFileSync/ioreg. If unavailable, vault init falls back gracefully. Verified by vault/src/index.ts error handling (lines 91-92). |
| A4 | The Replicate model version hash is valid and the model is accessible. | Replicate Smoke Test | If the version is wrong, HTTP 404 from Replicate. Risk mitigated by hardcoding a known-stable version that can be easily updated. |

## Environment Availability

**Step 2.6: SKIPPED** — The smoke command depends on the same runtime as the existing CLI (Node.js 22+, pnpm-built packages). It does not introduce new external dependencies. Production API connectivity (OpenAI, Replicate) is the feature being tested, not a build/CI dependency.

## Sources

### Primary (HIGH confidence)
- `apps/cli/src/commands/connect.ts` — Reference implementation for CLI command pattern (handleCommand, parseArgs, formatOutput)
- `apps/cli/src/index.ts` — Command dispatch switch/case pattern
- `packages/connector/src/index.ts` — connect() function implementation
- `packages/connector/src/http.ts` — callProvider() and ConnectorHttpError class
- `packages/connector/src/types.ts` — ConnectLock, ConnectParams, ConnectResult type definitions
- `packages/connector/src/mapper.ts` — mapInput/mapOutput field mapping logic
- `packages/connector/src/path.ts` — deriveApiPath feature_id to HTTP path derivation
- `packages/connector/src/index.test.ts` — Verified connect() behavior with mock and real API
- `packages/vault/src/index.ts` — Vault API key resolution (createVault, getKey)
- `packs/openai/provider-card.json` — OpenAI pack spec (base_url, auth_type, features, field_mappings)
- `packs/replicate/provider-card.json` — Replicate pack spec (base_url, auth_type, features, field_mappings)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All packages exist, verified by reading source.
- Architecture: HIGH - CLI command pattern is consistent across 7 existing commands. Connector path verified by reading full source chain.
- Pitfalls: HIGH - Async Replicate API and timeout limitations verified by reading connector source and Replicate provider card.
- Model version (Replicate): LOW - Version hash is a placeholder. Must be verified at implementation time.

**Research date:** 2026-05-08
**Valid until:** 2026-06-08 (30 days — CLI command patterns are stable, but Replicate model versions may change)
