# Architecture

Synapse Router is split into small packages so schema contracts, negotiation, provider adapters, and routing policy can evolve independently.

## Packages

- `packages/core`: shared contract types, result types, and error shapes.
- `packages/negotiator`: schema compatibility checks and contract adaptation.
- `packages/providers`: provider adapter interfaces and provider capability metadata.
- `packages/router`: route selection, policy evaluation, and execution handoff.

## Apps

- `apps/server`: HTTP boundary for submitting route contracts and receiving normalized results.
- `apps/comfy-node`: external submodule for Comfy-related integration work.
- `apps/playground`: local developer surface for testing contracts and provider behavior.

## Request Flow

1. Caller submits a route contract.
2. Router validates the contract shape.
3. Negotiator compares the contract against provider capabilities.
4. Router applies policy constraints.
5. Selected provider adapter executes the normalized request.
6. Router returns a normalized result with route metadata.

## Boundary Rule

Provider adapters may translate provider-specific request and response formats. Core contracts must not import provider SDK types.