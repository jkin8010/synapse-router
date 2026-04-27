# DSL Spec

The Synapse Router DSL describes an AI operation as a contract, not as provider-specific API parameters.

## Route Contract

```ts
type RouteContract = {
  id: string;
  intent: string;
  inputSchema: SchemaRef;
  outputSchema: SchemaRef;
  capabilities: CapabilityRequirement[];
  policy?: RoutePolicy;
};
```

## Schema References

Schemas should be addressable and versioned.

```ts
type SchemaRef = {
  name: string;
  version: string;
  format: "json-schema" | "zod";
};
```

## Capability Requirements

Capabilities describe what the provider must support to satisfy the contract.

```ts
type CapabilityRequirement =
  | { kind: "structured-output"; strict: boolean }
  | { kind: "tool-calling"; tools: string[] }
  | { kind: "vision-input" }
  | { kind: "streaming"; required: boolean };
```

## Route Policy

Policy constrains acceptable routing decisions.

```ts
type RoutePolicy = {
  maxLatencyMs?: number;
  maxCostUsd?: number;
  preferredProviders?: string[];
  excludedProviders?: string[];
  allowSchemaDowngrade?: boolean;
};
```

## Negotiation Result

Negotiation must produce a structured result before execution.

```ts
type NegotiationResult =
  | { status: "accepted"; contract: RouteContract }
  | { status: "adapted"; contract: RouteContract; changes: string[] }
  | { status: "rejected"; reasons: string[] };
```

