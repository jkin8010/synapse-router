---
sidebar_position: 3
title: synapse route
---

# synapse route — Multi-Dimensional Scored Routing

The `route` command performs multi-dimensional scoring, filtering, and sorting across candidate Providers to select the optimal Provider. Routing is a pure function — the same input always produces the same output. It supports 5 built-in strategies and custom strategies.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `<intent>` | string | Yes | — | Intent type (e.g. `chat`, `text-to-image`) |
| `--strategy <s>` | string | No | `balanced` | Routing strategy: `cheap` / `fast` / `quality` / `balanced` / `cost-capped` |
| `--exclude <ids>` | string | No | — | Comma-separated list of Providers to exclude |
| `--region <region>` | string | No | — | Preferred region (e.g. `us-east`, `eu-west`, `apac`) |
| `--min-version <v>` | string | No | — | Minimum model version (e.g. `3.5`, `4.0`) |

## Routing Strategies

The system provides 5 built-in strategies, each with different weight distributions across scoring dimensions:

| Strategy ID | Name | Weight Distribution (cost/latency/reliability/featureMatch/preference) | Use Case |
|-------------|------|-----------------------------------------------------------------------|----------|
| `cheap` | Cost First | 5 / 1 / 1 / 1 / 0.5 | Cost-sensitive scenarios |
| `fast` | Speed First | 1 / 5 / 1 / 1 / 0.5 | Real-time interaction scenarios |
| `quality` | Quality First | 0.25 / 0.25 / 6 / 4 / 0.5 | Quality-critical scenarios |
| `balanced` | Balanced (default) | 1 / 1 / 1 / 1 / 0.5 | General purpose |
| `cost-capped` | Budget Capped | 3 / 1 / 2 / 2 / 0.5 (+ maxCost filter) | Budget-constrained scenarios |

Custom strategies can be registered via `synapse config set route.strategies.<name>`.

## Scoring Dimensions

Each candidate Provider is scored across 5 dimensions, normalized to [0, 100]:

- **cost** — Feature-level cost coefficient + input size estimate
- **latency** — Provider latency tier (cheap/fast/quality) + region matching bonus
- **reliability** — Provider reliability coefficient 0~1
- **featureMatch** — Exact/fuzzy intent matching + region prefix + version filter
- **preference** — User-specified preferredProviders boost

Weighted total formula: `totalScore = Σ(dimensionScore × weight)`

### Filtering Rules

- **Explicit exclusion** — Providers specified in `--exclude` are excluded from scoring entirely
- **Intent filter** — Providers that do not match the intent at all are excluded
- **Cost cap** — Providers with estimated cost exceeding the `maxCost` threshold are filtered out
- **Reliability threshold** — Providers below `minReliability` are filtered out
- **Version filter** — featureMatch is downgraded for providers not meeting `minVersion`
- **Region matching** — Exact region match: +15 points, prefix match: +10 points

## Examples

### Example 1 — Balanced strategy (default)

```bash
synapse route chat
```

### Example 2 — Quality-first strategy

```bash
synapse route chat --strategy quality
```

### Example 3 — Exclude a provider

```bash
synapse route chat --exclude openai
```

### Example 4 — Region preference with minimum version

```bash
synapse route chat --region apac --min-version 3.5
```

### Example 5 — Cheap strategy for text-to-image

```bash
synapse route text-to-image --strategy cheap
```

## Decision Explainability

Each routing result includes a complete decision record (RouteResult) containing the following information:

- **intent** — The routed intent
- **totalCandidates** — Total number of candidate Providers
- **filteredAfterConstraints** — Number of Providers filtered out (including exclusions)
- **strategyWeights** — The weight vector used
- **failoverChain** — The failover chain (if failover occurred)
