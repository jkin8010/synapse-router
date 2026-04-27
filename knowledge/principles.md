# Principles

## Contracts Before Calls

Every route starts with a schema contract. Provider invocation is only allowed after the requested input, output, and capability requirements are known.

## Negotiation Is Explicit

Schema changes must be visible. If the router downgrades, adapts, or rejects a contract, callers should get a structured reason instead of silent fallback behavior.

## Providers Are Interchangeable, Not Identical

Provider adapters should expose capabilities honestly. The router chooses based on fit, cost, latency, reliability, and schema support, not on the assumption that all model APIs behave the same.

## Normalized Outputs

Application code should consume router-level result types. Provider-specific response shapes belong inside provider adapters.

## Minimal Core, Extensible Edges

The core should define contracts, negotiation results, route decisions, and errors. Provider details, policy rules, and runtime integrations should live outside the core boundary.

## Observable Routing

Every route decision should be explainable: requested schema, selected provider, negotiation result, and reason codes.