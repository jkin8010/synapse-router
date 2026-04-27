# Roadmap

## Phase 1: Contract Foundation

- Define core TypeScript types for route contracts, schemas, capabilities, policies, and negotiation results.
- Add validation helpers for contract shape.
- Keep execution out of scope until contracts are stable.

## Phase 2: Negotiation Engine

- Implement provider capability matching.
- Return accepted, adapted, or rejected negotiation results.
- Add reason codes for incompatibility and downgrade decisions.

## Phase 3: Provider Adapter Boundary

- Define a minimal provider adapter interface.
- Add mock provider adapters for deterministic tests.
- Keep real provider SDKs isolated from `packages/core`.

## Phase 4: Routing Policy

- Add selection rules for capability fit, cost, latency, and explicit provider preference.
- Emit route decision metadata for debugging and audit.

## Phase 5: Server and Playground

- Expose contract submission through `apps/server`.
- Use `apps/playground` to test negotiation outcomes before real provider calls.
- Add examples that show schema adaptation and rejection paths.