# Architecture: Billing Integration

**Domain:** Multi-provider AI routing layer (billing/usage metering integration)
**Researched:** 2026-05-10
**Confidence:** HIGH (based on direct codebase reading across all affected packages)

## System Overview

Billing sits at the boundary between invocation and observability. It is NOT embedded in any package -- it wraps from outside. This preserves the existing constraint that each package has a single, focused responsibility.

```
                             Calling Code (CLI / API Server)
                                      │
                        ┌─────────────┴─────────────┐
                        │       owns both           │
                        ▼                           ▼
              ┌─────────────────┐          ┌──────────────────┐
              │   @billing      │          │ @observability   │
              │   preCall()     │◄─span──►│ wrapBilling()    │
              │   postCall()    │          │ createSpan()     │
              └────────┬────────┘          └──────────────────┘
                       │ wraps
                       ▼
              ┌─────────────────┐
              │ @connector      │  ← unchanged, no billing knowledge
              │ connect()       │
              └─────────────────┘

Dev-time only:
  ┌─────────────────┐     ┌──────────────────┐
  │ @sdk-generator  │────►│ Generated SDK    │ ← billing config baked in as constants
  │ generateTypeScript│   │ (zero-dep,       │
  │ (--with-billing) │    │  native fetch)   │
  └─────────────────┘     └──────────────────┘
```

## Key Architectural Principles Applied

1. **Billing wraps, never modifies.** Connector, SDK-generator, and CLI each remain unchanged in their core responsibility. Billing is added as a wrapper layer.
2. **Billing does not import observability.** Circular dependency is prevented by keeping billing independent, using callbacks for events, and letting the caller wire them together.
3. **SDK zero-dependency preserved.** Billing config is compiled into the generated SDK as inline constants, never as an `@synapse-router/*` import.
4. **Connector thinness preserved.** The connector's `connect()` function receives no billing hooks. A higher-order wrapper adds billing before/after.
5. **Billing state lives caller-side.** QuotaManager is instantiated by the caller (CLI session or SDK runtime), not by connector or sdk-generator.

## Component Boundaries

### Current State (no billing integration)

| Package | Responsibility | Public API |
|---------|---------------|------------|
| `@synapse-router/connector` | Thin HTTP: mapInput + callProvider + mapOutput | `connect(params): ConnectResult` |
| `@synapse-router/billing` | Pricing, quotas, fallback (standalone) | `Billing.preCall()`, `Billing.postCall()` |
| `@synapse-router/sdk-generator` | Template-based code generation | `generateTypeScript(packData): GeneratedFile[]` |
| `@synapse-router/observability` | Trace/spans, redaction, routing wrappers | `wrapBilling(fn, attrs)`, `wrapConnect(fn, attrs)` |
| `apps/cli` | Commander-based CLI | `synapse connect`, `synapse sdk generate`, `synapse evolve` |

### After Billing Integration

| Package | What Changes | How |
|---------|-------------|-----|
| `@synapse-router/connector` | **Unchanged** | No hooks added. Billing wraps externally. |
| `@synapse-router/billing` | **+New exports** | `createBillingConnector()`, `syncBillingConfig()`, pricing from ProviderFeature.limits |
| `@synapse-router/sdk-generator` | **+Option** | `--with-billing` flag; generates `billingConfig` constants + optional BillingTracker class |
| `@synapse-router/observability` | **Unchanged** | `wrapBilling()` already decoupled; billing never imports observability |
| `apps/cli` | **+New command** | `synapse billing config|show|status`; `synapse connect` auto-reads billing config |

## Detailed Architecture Decisions

### Decision 1: Connector Integration -- Wrapper Pattern

**Decision:** Billing wraps AROUND connector, never inside.

`@synapse-router/billing/src/connector.ts` (new file):

```typescript
import { connect as rawConnect, type ConnectParams, type ConnectResult } from '@synapse-router/connector';
import { Billing } from './billing.js';
import type { BillingConfig } from './types.js';

export interface BillingConnectorConfig {
  billing: BillingConfig;
  // Optional callbacks for observability wiring
  onPreCall?: (params: PreCallParams, result: PreCallResult) => void;
  onPostCall?: (params: PostCallParams, result: PostCallResult) => void;
  onAlert?: (alert: BillingAlert) => void;
}

/**
 * Creates a billing-aware connector by wrapping the raw connect function.
 * The caller provides a BillingConfig (pricing + quotas + fallback).
 * Returns an async function matching ConnectParams → ConnectResult signature,
 * transparent to the consumer.
 */
export function createBillingConnector(config: BillingConnectorConfig) {
  const billing = new Billing(config.billing);

  return async function billingConnect(params: ConnectParams): Promise<ConnectResult> {
    // 1. Pre-call: estimate cost, check quotas
    const preCallResult = await billing.preCall({
      lock: params.lock,
      estimatedInputTokens: estimateTokens(params.input),
      estimatedQuantity: 1,
    });
    config.onPreCall?.({ lock: params.lock, ... }, preCallResult);

    if (!preCallResult.allowed) {
      throw new BillingBlockedError(preCallResult);
    }

    // 2. Actual call (delegate to raw connector)
    const result = await rawConnect(params);

    // 3. Post-call: calculate actual cost, consume quotas
    const postCallResult = await billing.postCall({
      lock: params.lock,
      result,
      estimatedCost: preCallResult.estimatedCost,
    });
    config.onPostCall?.({ lock: params.lock, result }, postCallResult);

    if (postCallResult.alerts.length > 0) {
      for (const alert of postCallResult.alerts) {
        config.onAlert?.(alert);
      }
    }

    return result;
  };
}
```

**Rationale:**
- Connector remains thin (no business logic)
- Billing is optional -- callers who don't want billing use raw `connect()`
- The wrapper matches the same `(params) => Promise<Result>` signature for drop-in replacement
- Callbacks let the caller wire in observability without billing knowing about it

**What this means for files:**
- New: `packages/billing/src/connector.ts` (billing-aware connector factory)
- New: `packages/billing/src/errors.ts` (BillingBlockedError type)
- Modified: `packages/billing/src/index.ts` (add new exports)
- Unchanged: `packages/connector/src/` (zero modifications)

### Decision 2: SDK Generation -- Inline with Optional Flag

**Decision:** Billing code is generated INLINE in the SDK when `--with-billing` is specified. The default (no flag) produces the current zero-billing SDK.

**Generated file structure with `--with-billing`:**

```
<output-dir>/
├── openai/
│   ├── index.ts           # unchanged; re-exports client + types
│   ├── client.ts          # MODIFIED: adds optional billing param to constructor
│   ├── billing.ts         # NEW: baked-in billing config constants + BillingTracker class
│   ├── types.ts           # unchanged
│   ├── chat.ts            # unchanged
│   └── README.md          # unchanged
├── synapse.json           # MODIFIED: includes billing: true in metadata
```

**Generated `client.ts` constructor and method (billing-aware version):**

```typescript
export class OpenaiClient {
  private baseUrl: string;
  private apiKey: string;
  private billing?: BillingTracker;

  constructor(options: {
    baseUrl?: string;
    apiKey: string;
    billing?: BillingTracker;  // NEW: optional billing tracker
  }) {
    this.baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
    this.apiKey = options.apiKey;
    this.billing = options.billing;
  }

  async chatCompletions(input: ChatCompletionsInput): Promise<ChatCompletionsOutput> {
    // Billing pre-call (if enabled)
    this.billing?.preCall({ featureId: 'chat_post_v1_chat_completions', input });

    const url = `${this.baseUrl}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify(input),
    });

    // (error handling unchanged)
    const result = await response.json() as ChatCompletionsOutput;

    // Billing post-call (if enabled)
    this.billing?.postCall({ featureId: 'chat_post_v1_chat_completions', usage: result.usage });

    return result;
  }
}
```

**Generated `billing.ts`:**

```typescript
// Auto-generated by @synapse-router/sdk-generator --with-billing
// DO NOT EDIT. Regenerate with: synapse evolve --with-billing

export interface BillingEvent {
  featureId: string;
  timestamp: string;
  estimatedTokens?: number;
  actualTokens?: number;
  cost: number;
}

export interface BillingTrackerOptions {
  onUsage?: (event: BillingEvent) => void;
  maxCost?: number;
  maxTokens?: number;
}

/**
 * Inline billing tracker. Zero external dependencies.
 * Pricing config is baked in as constants at generation time.
 */
export class BillingTracker {
  private options: BillingTrackerOptions;
  private totalCost = 0;
  private totalTokens = 0;

  // Baked-in pricing: { feature_id → { strategy, inputPrice, outputPrice, unit } }
  static readonly PRICING = { ... } as const;

  constructor(options?: BillingTrackerOptions) {
    this.options = options ?? {};
  }

  preCall(params: { featureId: string; input?: unknown }): void {
    if (this.options.maxCost && this.totalCost >= this.options.maxCost) {
      throw new Error('Billing limit exceeded');
    }
  }

  postCall(params: { featureId: string; usage?: { input_tokens?: number; output_tokens?: number } }): void {
    const pricing = (this.constructor as typeof BillingTracker).PRICING[params.featureId];
    if (!pricing) return;

    const inputTokens = params.usage?.input_tokens ?? 0;
    const outputTokens = params.usage?.output_tokens ?? 0;
    const cost = (inputTokens * pricing.inputPrice + outputTokens * pricing.outputPrice) / 1000;

    this.totalCost += cost;
    this.totalTokens += inputTokens + outputTokens;

    this.options.onUsage?.({
      featureId: params.featureId,
      timestamp: new Date().toISOString(),
      actualTokens: inputTokens + outputTokens,
      cost,
    });
  }

  getStats() { return { totalCost: this.totalCost, totalTokens: this.totalTokens }; }
}
```

**SDK Generator changes:**

| File | Change |
|------|--------|
| `sdk-generator/src/index.ts` | Add `SdkGenerateOptions.billing` flag |
| `sdk-generator/src/typescript.ts` | New `--with-billing` mode: generates `billing.ts`, modifies `client.ts` constructor |
| `sdk-generator/src/python.ts` | Similar change for Python (lower priority) |

**Rationale:**
- SDK zero-dependency is preserved (BillingTracker is pure TypeScript, no imports)
- Billing is optional: `new OpenaiClient({ apiKey, billing: new BillingTracker() })`
- Pricing config is baked in at generation time (dev-time determination)
- Callers who don't need billing get the same pure SDK as before

**Constraint check:**
- "SDK must NOT import @synapse-router/*" -- PASS. BillingTracker is generated inline.
- "Runtime = pure code SDK, no LLM" -- PASS. BillingTracker is deterministic arithmetic.
- "Runtime zero token cost" -- PASS. No external calls in BillingTracker.

### Decision 3: CLI Billing Command

**Decision:** `synapse billing` is a new top-level command for configuration, with `synapse connect` auto-reading billing config from `.synapse/config.json`.

**Command structure:**

```
synapse billing                     → show help
synapse billing init                → interactive: set up billing for a provider
synapse billing config              → show current billing config
synapse billing config set <key> <value>  → set pricing/quota values
synapse billing status              → show current quota state (session)
synapse billing show <provider>     → show billing config for a provider
```

**Config format (`.synapse/config.json` extension):**

```json
{
  "providers": {
    "openai": {
      "base_url": "https://api.openai.com/v1",
      "billing": {
        "pricing": { "source": "pack" },
        "quotas": [
          { "id": "cost-monthly", "type": "cost", "limit": 100, "period": "month", "threshold": 0.8 }
        ],
        "fallback": { "strategy": "reject" }
      }
    }
  }
}
```

**Changes to existing commands:**

- `synapse connect` -- NEW behavior: reads `config.providers[provider].billing` and auto-wraps the connector with `createBillingConnector()` if billing config is present. Silent if no billing config.

**What this means for files:**

| File | Change |
|------|--------|
| `apps/cli/src/commands/billing.ts` | NEW: `synapse billing` command handler |
| `apps/cli/src/index.ts` | ADD: `case "billing"` to command switch; add to help text |
| `apps/cli/src/commands/connect.ts` | MODIFY: after resolving lock, check for billing config and wrap connector |

**Rationale:**
- Billing config is project-level (not per-connect), so it should be managed separately
- `synapse connect` auto-picks it up for a seamless dev experience
- Separate `billing` command keeps `connect` focused on its core job

### Decision 4: Data Flow -- Billing State Location

**Decision:** Billing state lives at the CALLER level, not in connector or SDK scope. Two distinct lifecycles:

**Mode A: CLI Connect (development/debugging)**

```
synapse connect
  │
  ├── Load config → extract providers[openai].billing
  ├── Create Billing instance (ephemeral, in-memory QuotaManager)
  ├── Create billingConnect = createBillingConnector(connect, config)
  │
  ├── billingConnect(lock, input, connection)
  │   ├── billing.preCall()    ← checks in-memory quotas
  │   ├── connect()            ← actual HTTP call
  │   └── billing.postCall()   ← consumes in-memory quotas
  │
  └── Billing instance GC'd after command exits
```

**Mode B: Generated SDK (production deployment)**

```
User code
  │
  ├── const billing = new BillingTracker({ onUsage: emitToTelemetry })
  ├── const client = new OpenaiClient({ apiKey, billing })
  │
  ├── client.chatCompletions({...})
  │   ├── billing.preCall()    ← checks inline limits
  │   ├── fetch()              ← native HTTP
  │   └── billing.postCall()   ← tracks cost, emits onUsage callback
  │
  ├── billing.getStats()       ← query during or after
  └── client.chatCompletions({...})
```

**State persistence:**
- CLI mode: in-memory only (per session). For persistent quotas, use `synapse billing status` during a long-running dev server.
- SDK mode: BillingTracker accepts an `onUsage` callback for external persistence (file, Redis, telemetry pipe). The tracker itself is stateless between method calls except for optional cumulative counters.

**What this means for files:**

| Component | State Location | Lifetime | Persistence |
|-----------|---------------|----------|-------------|
| CLI connect | CLI scope (Billing instance) | Per command | None (in-memory) |
| Generated SDK | BillingTracker instance | Per client instance | Optional (onUsage callback) |
| evol utility | Not affected | N/A | N/A |

### Decision 5: Billing vs Observability -- No Circular Dependencies

**Decision:** Billing does NOT import observability. Observability wraps billing calls from outside.

**Current dependency graph (no cycle):**

```
billing (standalone, no @synapse-router deps)
    ↑ used by (no import)
observability (provides wrapBilling as a generic wrapper)
    ↑ imports from callers
CLI / API Server (imports both billing and observability)
```

**After integration (preserved):**

```
billing
    ↑ (callbacks, no imports from observability)
CLI / API Server
    │ imports observability → wrapBilling(billing.preCall, attrs)
    │ imports billing → billing.preCall(), billing.postCall()
    ▼
observability
```

**How observability wires in (in CLI/API caller code):**

```typescript
import { createTracer } from '@synapse-router/observability';
import { wrapBilling } from '@synapse-router/observability/router';
import { Billing } from '@synapse-router/billing';
import { createBillingConnector } from '@synapse-router/billing/connector';

const tracer = createTracer();
const billing = new Billing(config);

// Option A: observability wraps specific billing calls
const trace = tracer.trace('connect');
const preCallResult = await wrapBilling(
  trace,
  () => billing.preCall({ lock, estimatedInputTokens: 1000 }),
  { provider: 'openai', feature_id: 'chat' }
);

// Option B: observability wraps through connector callbacks
const billingConnect = createBillingConnector({
  billing: config,
  onPreCall: (_, result) => {
    wrapBilling(trace, () => Promise.resolve(result), {
      provider: lock.provider,
      feature_id: lock.feature_id,
      estimated_cost: result.estimatedCost,
    });
  },
  onAlert: (alert) => {
    tracer.trace('billing-alert').span('billing').start({ alert }).end();
  },
});
```

**If billing needs to emit events for telemetry (future need):**

Use a callback/emitter pattern rather than importing observability:

```typescript
// billing -- no observability import
this.config.onAlert?.(alert);  // optional callback

// caller wires it up
new Billing({
  ...config,
  onAlert: (alert) => {
    tracer.trace('billing')
      .span('alert')
      .start({ alert })
      .end();
  },
});
```

**Constraint check:**
- Billing never imports @synapse-router/observability -- PASS
- Circular dependency impossible by construction -- PASS

## Files: New vs Modified

### New Files

| File | Purpose | Size Estimate |
|------|---------|---------------|
| `packages/billing/src/connector.ts` | Billing-aware connector factory | ~50 lines |
| `packages/billing/src/errors.ts` | BillingBlockedError, BillingConfigError | ~30 lines |
| `apps/cli/src/commands/billing.ts` | `synapse billing` command handler | ~150 lines |
| `sdk-generator/src/billing.ts` | BillingTracker template generation | ~80 lines |

### Modified Files

| File | Change Type | Scope |
|------|-------------|-------|
| `packages/billing/src/index.ts` | Add exports | +3 export lines |
| `packages/billing/src/types.ts` | Add callback types (optional) | +5 lines |
| `packages/sdk-generator/src/index.ts` | Add `billing` option to `SdkGenerateOptions` | +2 lines |
| `packages/sdk-generator/src/typescript.ts` | New `--with-billing` generation path | ~+60 lines |
| `packages/sdk-generator/src/python.ts` | Python billing support (P2) | ~+50 lines |
| `apps/cli/src/index.ts` | Add billing command routing + help text | ~+15 lines |
| `apps/cli/src/commands/connect.ts` | Auto-read billing config, wrap connector | ~+30 lines |

### Unchanged Files (Confirmed)

| Package | Why Unchanged |
|---------|---------------|
| `packages/connector/src/*` | Wrapper pattern keeps connector pure |
| `packages/observability/src/*` | Already decoupled from billing |
| `packages/observability/src/router/billing.ts` | Already generic (wrapBilling takes any function) |
| `packages/core/src/*` | No new types needed (ProviderFeature.limits suffices) |
| `packages/router/src/*` | Unrelated to billing |
| `packages/lock/src/*` | Unrelated to billing |
| `packages/vault/src/*` | Unrelated to billing |
| `packs/*/provider-card.json` | Pricing data already in ProviderFeature.pricing/limits |

## Build Order

```
Phase 1: Connector wrapper
  packages/billing/src/connector.ts        (NEW)
  packages/billing/src/errors.ts           (NEW)
  packages/billing/src/index.ts             (MODIFY)
  └── No cross-package deps beyond existing

Phase 2: SDK generation
  packages/sdk-generator/src/billing.ts     (NEW)
  packages/sdk-generator/src/typescript.ts  (MODIFY)
  packages/sdk-generator/src/index.ts       (MODIFY)
  └── Depends on Phase 1 for types, but only reads billing config shape

Phase 3: CLI billing command
  apps/cli/src/commands/billing.ts          (NEW)
  apps/cli/src/index.ts                     (MODIFY)
  apps/cli/src/commands/connect.ts          (MODIFY)
  └── Depends on Phase 1 for createBillingConnector

Phase 4: Python SDK billing (optional, lower priority)
  packages/sdk-generator/src/python.ts      (MODIFY)
```

## Scaling Considerations

| Concern | At dev/test (CLI connect) | At production (generated SDK) |
|---------|--------------------------|-------------------------------|
| Quota state lifetime | Per-command (ephemeral) | Per-client-instance (long-lived) |
| Quota storage | In-memory only | via `onUsage` callback to persistent store |
| Pricing lookup | From billing config | Baked-in as constants |
| Concurrency | N/A (single connect) | BillingTracker works per-client; shared state needs external store |
| Multi-tenant | N/A | Wrap BillingTracker creation per tenant |

## Anti-Patterns

### Anti-Pattern 1: Adding billing hooks INSIDE connector

**What:** Adding `onBefore`/`onAfter` callbacks or optional billing params to `connect()` itself.

**Why wrong:** Violates "connector is thin" principle. Makes every connector caller pay the complexity cost even if they don't use billing. Creates coupling between connector and billing types.

**Do instead:** Use the wrapper pattern. `createBillingConnector(connect, config)` returns a function with the same signature. Connector remains pure.

### Anti-Pattern 2: Importing billing package from generated SDK

**What:** Generated SDK does `import { BillingTracker } from '@synapse-router/billing'`.

**Why wrong:** Violates SDK zero-dependency constraint. Generated SDK cannot depend on any @synapse-router/* package by design.

**Do instead:** Generate the BillingTracker class inline with baked-in constants. The generated code is self-contained TypeScript, zero imports beyond native fetch.

### Anti-Pattern 3: Billing importing observability for trace emission

**What:** Adding `import { createBillingSpan } from '@synapse-router/observability/router'` inside billing package.

**Why wrong:** Creates a circular dependency path: observability's own `wrapBilling` already references billing span concepts, and if billing imports observability, you get observability → billing → observability. Also violates separation of concerns (billing should not know about tracing).

**Do instead:** Use callback pattern. Billing accepts optional `onAlert`, `onPreCall`, `onPostCall` callbacks. The caller (CLI/API) wires observable behavior into these callbacks. Billing stays pure.

### Anti-Pattern 4: Passing billing config via CLI connect flags

**What:** `synapse connect --billing-config ./billing.json --quota-limit 100`.

**Why wrong:** Billing config is project-level setup, not per-call. Passing it as connect flags adds noise and encourages ad-hoc billing that isn't reproducible.

**Do instead:** Manage billing config via `synapse billing init` (stored in `.synapse/config.json`). `synapse connect` reads it automatically. For test overrides, `--billing-config` is acceptable but discouraged.

## Sources

- Codebase reading: `packages/connector/src/index.ts`, `packages/billing/src/billing.ts`, `packages/billing/src/types.ts`, `packages/billing/src/quota.ts`
- Codebase reading: `packages/sdk-generator/src/typescript.ts`, `packages/sdk-generator/src/generator.ts`
- Codebase reading: `apps/cli/src/commands/connect.ts`, `apps/cli/src/commands/sdk.ts`, `apps/cli/src/index.ts`
- Codebase reading: `packages/observability/src/router/billing.ts`, `packages/observability/src/router/types.ts`
- Constraint documentation: `CLAUDE.md` (architectural principles, SDK zero-dependency, connector thinness)
- Confidence: HIGH for all findings -- all assertions verified against actual source code in the repository at `/Users/jkin/workspace/qise-tech/synapse-router/packages/` and `/Users/jkin/workspace/qise-tech/synapse-router/apps/`.
