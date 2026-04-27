# Vision

Synapse Router is a controlled schema negotiation and multi-provider routing layer for AI agents.

Its job is not to be another agent framework. It sits between agents, tools, models, and provider APIs so that every request has an explicit contract before execution.

## Developer Goal

Developers should be able to:

- Declare the shape of an intended AI operation.
- Negotiate the closest supported schema across providers.
- Route execution to the provider best suited for that contract.
- Receive normalized, typed outputs that can be trusted by downstream code.

## Non-Goals

- No hidden prompt orchestration.
- No implicit provider-specific behavior leaking into application code.
- No business workflow logic in the routing layer.

The router should make provider choice and schema compatibility observable, testable, and replaceable.