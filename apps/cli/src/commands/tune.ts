// @synapse-router/cli — `synapse evolve --tune` logic
// Offline strategy weight tuning from production profile data
// This is the Evolution layer: real data adjusts the routing model

import {
  scoreCost,
  scoreLatency,
  scoreReliability,
  weightedTotal,
  type ProviderCapability,
  type DimensionScores,
} from "@synapse-router/router";
import type { ProviderProfile } from "./profile.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StrategyTuneReport {
  tuned_at: string;
  strategy: string;
  current_weights: Partial<DimensionScores>;
  suggested_weights: Partial<DimensionScores>;
  providers_evaluated: number;
  findings: TuningFinding[];
  summary: string;
}

export interface TuningFinding {
  dimension: keyof DimensionScores;
  provider: string;
  observed_score: number;
  expected_range: [number, number];
  bias: "under" | "over" | "match";
  suggestion: string;
}

// ---------------------------------------------------------------------------
// Tuning logic
// ---------------------------------------------------------------------------

/**
 * Load strategy weights for a given strategy name.
 */
function getStrategyWeights(strategy: string): Partial<DimensionScores> {
  const defaults: Record<string, Partial<DimensionScores>> = {
    cheap: { cost: 5, latency: 1, reliability: 1, featureMatch: 1, preference: 0.5 },
    fast: { cost: 1, latency: 5, reliability: 1, featureMatch: 1, preference: 0.5 },
    quality: { cost: 0.25, latency: 0.25, reliability: 6, featureMatch: 4, preference: 0.5 },
    balanced: { cost: 1, latency: 1, reliability: 1, featureMatch: 1, preference: 0.5 },
    "cost-capped": { cost: 3, latency: 1, reliability: 2, featureMatch: 2, preference: 0.5 },
  };
  return defaults[strategy] ?? defaults.balanced;
}

/**
 * Convert provider profile to a ProviderCapability-like shape for scoring.
 */
function profileToCapability(profile: ProviderProfile, intent: string): ProviderCapability {
  const successRate = profile.success_rate;
  // Map success rate to reliability 0-1
  const reliability = Math.min(1, Math.max(0, successRate));

  // Determine latency category from profile data
  const p95 = profile.latency_ms.p95;
  const latencyCategory: "cheap" | "fast" | "quality" = 
    p95 < 300 ? "fast" :
    p95 < 2000 ? "quality" :
    "cheap";

  return {
    id: profile.provider,
    name: profile.provider,
    features: Object.entries(profile.features).map(([id, fp]) => ({
      id,
      intent,
      costPerUnit: profile.cost_per_1k / 1000,
      estimatedLatencyMs: fp.latency_p50,
    })),
    performance: {
      latencyCategory,
      reliability,
    },
  };
}

// ─── Main tuning function ──────────────────────────────────────────────────

/**
 * Tune strategy weights based on observed production profile data.
 * Called from `synapse evolve --tune`.
 */
export function tuneStrategies(
  profiles: ProviderProfile[],
  strategies: string[] = ["cheap", "fast", "quality", "balanced"],
): StrategyTuneReport[] {
  if (profiles.length === 0) return [];

  const reports: StrategyTuneReport[] = [];

  for (const strategy of strategies) {
    const weights = getStrategyWeights(strategy);
    const findings: TuningFinding[] = [];

    for (const profile of profiles) {
      if (profile.sample_count < 10) continue; // insufficient data

      // Build capability for comparison
      const cap = profileToCapability(profile, "chat");

      // Observed values (from profile)
      const observedSuccessRate = profile.success_rate;
      const observedLatencyMs = profile.latency_ms.p50;
      const observedCostPerUnit = profile.cost_per_1k / 1000;

      // Expected scores from the model
      const modelCost = scoreCost({ costPerUnit: observedCostPerUnit } as any);
      const modelLatency = scoreLatency(cap.performance.latencyCategory, observedLatencyMs);
      const modelReliability = scoreReliability(observedSuccessRate);

      // Determine if the model is over or underestimating this provider
      const dimensionChecks: Array<{
        dim: keyof DimensionScores;
        model: number;
        description: string;
      }> = [
        { dim: "cost", model: modelCost, description: `cost $${observedCostPerUnit.toFixed(4)}/unit` },
        { dim: "latency", model: modelLatency, description: `latency p50=${observedLatencyMs}ms` },
        { dim: "reliability", model: modelReliability, description: `success ${(observedSuccessRate * 100).toFixed(1)}%` },
      ];

      for (const check of dimensionChecks) {
        const observed = check.model; // We use model as observed since we're
        // comparing actual data to model expectations

        // Instead, let's compare expected range for the provider's category
        const category = cap.performance.latencyCategory;
        let expectedRange: [number, number];

        switch (check.dim) {
          case "cost":
            expectedRange = observedCostPerUnit < 0.01 ? [80, 100] :
                           observedCostPerUnit < 0.1 ? [60, 85] :
                           [30, 60];
            break;
          case "latency":
            expectedRange = category === "fast" ? [80, 100] :
                           category === "quality" ? [35, 60] :
                           [45, 70];
            break;
          case "reliability":
            expectedRange = observedSuccessRate > 0.98 ? [90, 100] :
                           observedSuccessRate > 0.95 ? [75, 90] :
                           observedSuccessRate > 0.90 ? [60, 75] :
                           [30, 60];
            break;
          default:
            expectedRange = [0, 100];
        }

        // Determine bias
        let bias: "under" | "over" | "match";
        let suggestion: string;

        if (check.model < expectedRange[0]) {
          bias = "under";
          suggestion = `Consider increasing ${check.dim} weight for ${strategy} strategy`;
        } else if (check.model > expectedRange[1]) {
          bias = "over";
          suggestion = `Consider decreasing ${check.dim} weight for ${strategy} strategy`;
        } else {
          bias = "match";
          suggestion = "Within expected range";
        }

        if (profile.sample_count >= 10) {
          findings.push({
            dimension: check.dim,
            provider: profile.provider,
            observed_score: Math.round(check.model),
            expected_range: expectedRange,
            bias,
            suggestion,
          });
        }
      }
    }

    // Generate summary
    const underCount = findings.filter((f) => f.bias === "under").length;
    const overCount = findings.filter((f) => f.bias === "over").length;
    const matchCount = findings.filter((f) => f.bias === "match").length;

    let summary: string;
    if (findings.length === 0) {
      summary = `Insufficient data for strategy "${strategy}" tuning`;
    } else if (underCount > findings.length / 2) {
      summary = `Strategy "${strategy}" may be underpredicting — consider increasing weights for observed dimensions`;
    } else if (overCount > findings.length / 2) {
      summary = `Strategy "${strategy}" may be overpredicting — consider decreasing weights for observed dimensions`;
    } else {
      summary = `Strategy "${strategy}" scores are within expected ranges for most providers`;
    }

    // Suggest adjusted weights
    const suggestedWeights = adjustWeights(weights, findings, strategy);

    reports.push({
      tuned_at: new Date().toISOString(),
      strategy,
      current_weights: weights,
      suggested_weights: suggestedWeights,
      providers_evaluated: profiles.filter((p) => p.sample_count >= 10).length,
      findings: findings.slice(0, 30), // Limit findings in output
      summary,
    });
  }

  return reports;
}

// ─── Weight adjustment ────────────────────────────────────────────────────

function adjustWeights(
  current: Partial<DimensionScores>,
  findings: TuningFinding[],
  strategy: string,
): Partial<DimensionScores> {
  const adjusted = { ...current };

  // Count biases per dimension
  const biases: Record<string, { under: number; over: number }> = {};
  for (const f of findings) {
    if (!biases[f.dimension]) biases[f.dimension] = { under: 0, over: 0 };
    biases[f.dimension][f.bias === "match" ? "under" : f.bias]++;
  }

  // Adjust: under → increase weight, over → decrease weight
  for (const [dim, counts] of Object.entries(biases)) {
    const key = dim as keyof DimensionScores;
    const currentVal = current[key] ?? 1;

    if (counts.under > counts.over && counts.under > 0) {
      adjusted[key] = Math.min(10, currentVal * 1.3);
    } else if (counts.over > counts.under && counts.over > 0) {
      adjusted[key] = Math.max(0.1, currentVal * 0.7);
    }
  }

  return adjusted;
}

// ─── Report formatting ────────────────────────────────────────────────────

export function formatTuneReportAsJson(reports: StrategyTuneReport[]): string {
  return JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      source: "synapse evolve --tune",
      description: "Strategy weight tuning based on production profile data",
      strategies: reports,
    },
    null,
    2,
  );
}

export function formatTuneReportAsText(reports: StrategyTuneReport[]): string {
  const lines: string[] = [];
  lines.push("# Synapse Router — Strategy Tuning Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Providers evaluated: ${reports.length > 0 ? reports[0].providers_evaluated : 0}`);
  lines.push("");

  for (const report of reports) {
    lines.push(`## Strategy: ${report.strategy}`);
    lines.push("");
    lines.push(`**Summary:** ${report.summary}`);
    lines.push("");

    // Current vs suggested weights
    lines.push("### Weights");
    lines.push("");
    lines.push("| Dimension | Current | Suggested | Change |");
    lines.push("|-----------|---------|-----------|--------|");

    const allDims: Array<keyof DimensionScores> = [
      "cost", "latency", "reliability", "featureMatch",
    ];
    for (const dim of allDims) {
      const current = (report.current_weights as any)[dim] ?? 1;
      const suggested = (report.suggested_weights as any)[dim] ?? 1;
      const change = suggested !== current
        ? `${suggested > current ? "+" : ""}${(suggested - current).toFixed(1)}`
        : "—";
      lines.push(`| ${dim} | ${current.toFixed(1)} | ${suggested.toFixed(1)} | ${change} |`);
    }

    // Findings
    if (report.findings.length > 0) {
      lines.push("");
      lines.push("### Detailed Findings");
      lines.push("");
      lines.push("| Provider | Dimension | Observed | Expected Range | Bias | Suggestion |");
      lines.push("|----------|-----------|----------|----------------|------|------------|");

      for (const f of report.findings) {
        const biasIcon = f.bias === "under" ? "⬇" : f.bias === "over" ? "⬆" : "✓";
        lines.push(
          `| ${f.provider} | ${f.dimension} | ${f.observed_score} | [${f.expected_range[0]}, ${f.expected_range[1]}] | ${biasIcon} ${f.bias} | ${f.suggestion} |`,
        );
      }
    }

    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // How to apply
  lines.push("## How to Apply These Suggestions");
  lines.push("");
  lines.push("To apply suggested weight changes:");
  lines.push("");
  lines.push("```bash");
  lines.push("# Persist custom strategies via config");
  lines.push("synapse config set route.strategies.myCustom.weights.cost 2.0");
  lines.push("synapse config set route.strategies.myCustom.weights.latency 1.5");
  lines.push("");
  lines.push("# Then use the custom strategy");
  lines.push("synapse route chat --strategy myCustom");
  lines.push("```");
  lines.push("");
  lines.push("Or apply to the default strategy with one-off weights:");
  lines.push("");
  lines.push("```bash");
  lines.push('synapse route chat --strategy-weights \'{"cost":2,"latency":1}\'');
  lines.push("```");

  return lines.join("\n");
}
