import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  scoreCost,
  scoreLatency,
  scoreReliability,
  scoreFeatureMatch,
  scorePreference,
  scoreProvider,
  weightedTotal,
  route,
  getStrategies,
  getStrategy,
  registerCustomStrategy,
  registerCustomStrategies,
  unregisterCustomStrategy,
  BUILTIN_STRATEGY_IDS,
  type ProviderCapability,
  type RoutingRequest,
} from "./index.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const openAI: ProviderCapability = {
  id: "openai",
  name: "OpenAI",
  features: [
    {
      id: "chat_post_v1_chat_completions",
      intent: "chat",
      costPerUnit: 0.15,   // GPT-4o-mini: ~$0.15/1M input tokens
      estimatedLatencyMs: 300,
      supportsStructuredOutput: true,
    },
    {
      id: "embeddings_post_v1_embeddings",
      intent: "embeddings",
      costPerUnit: 0.02,
      estimatedLatencyMs: 200,
    },
  ],
  performance: {
    latencyCategory: "fast",
    reliability: 0.995,
  },
};

const replicate: ProviderCapability = {
  id: "replicate",
  name: "Replicate",
  features: [
    {
      id: "image_post_v1_predictions",
      intent: "text-to-image",
      costPerUnit: 0.005,
      estimatedLatencyMs: 5000,
    },
  ],
  performance: {
    latencyCategory: "cheap",
    reliability: 0.92,
  },
};

const comfyUI: ProviderCapability = {
  id: "comfyui",
  name: "ComfyUI",
  features: [
    {
      id: "image_post_v1_generations",
      intent: "text-to-image",
      costPerUnit: 0.001,
      estimatedLatencyMs: 2000,
    },
  ],
  performance: {
    latencyCategory: "quality",
    reliability: 0.89,
  },
};

const anthropic: ProviderCapability = {
  id: "anthropic",
  name: "Anthropic",
  features: [
    {
      id: "chat_post_v1_messages",
      intent: "chat",
      costPerUnit: 0.25,
      estimatedLatencyMs: 500,
      supportsStructuredOutput: true,
    },
  ],
  performance: {
    latencyCategory: "quality",
    reliability: 0.97,
  },
};

const groq: ProviderCapability = {
  id: "groq",
  name: "Groq",
  features: [
    {
      id: "chat_post_v1_chat_completions",
      intent: "chat",
      costPerUnit: 0.01,   // 10x cheaper than OpenAI
      estimatedLatencyMs: 80,  // ~4x faster than OpenAI
      supportsStructuredOutput: false,
    },
  ],
  performance: {
    latencyCategory: "fast",
    reliability: 0.94,
  },
};

const ALL_PROVIDERS = [openAI, anthropic, replicate, comfyUI, groq];

// ─── Scorer Tests ────────────────────────────────────────────────────────────

describe("scoreCost", () => {
  test("very cheap ($0.001/unit) → near 100", () => {
    assert.ok(scoreCost({ costPerUnit: 0.001 } as any) > 95);
  });

  test("moderate cost ($1/unit) → around 40", () => {
    const s = scoreCost({ costPerUnit: 1 } as any);
    assert.ok(s >= 35 && s <= 45);
  });

  test("expensive ($10/unit) → low score", () => {
    const s = scoreCost({ costPerUnit: 10 } as any);
    assert.ok(s < 25);
  });

  test("no cost data → 50", () => {
    assert.equal(scoreCost(undefined), 50);
  });

  test("free (0) → 100", () => {
    assert.equal(scoreCost({ costPerUnit: 0 } as any), 100);
  });
});

describe("scoreLatency", () => {
  test("fast category → near 90", () => {
    assert.ok(scoreLatency("fast") >= 85);
  });

  test("cheap category → near 60", () => {
    assert.ok(scoreLatency("cheap") >= 55 && scoreLatency("cheap") <= 65);
  });

  test("quality category → near 40", () => {
    assert.ok(scoreLatency("quality") >= 35 && scoreLatency("quality") <= 45);
  });

  test("fast + very low ms → higher score", () => {
    const base = scoreLatency("fast");
    const withMs = scoreLatency("fast", 50);
    assert.ok(withMs > base);
  });

  test("quality + very low ms → boost from ms data", () => {
    const base = scoreLatency("quality");
    const withMs = scoreLatency("quality", 50);
    assert.ok(withMs > base);
  });
});

describe("scoreReliability", () => {
  test("perfect reliability → 100", () => {
    assert.equal(scoreReliability(1), 100);
  });

  test("0.995 → ~96", () => {
    const s = scoreReliability(0.995);
    assert.ok(s > 94 && s < 99);
  });

  test("0.95 → ~81", () => {
    const s = scoreReliability(0.95);
    assert.ok(s > 75 && s < 85);
  });

  test("0.9 → ~66", () => {
    const s = scoreReliability(0.9);
    assert.ok(s > 60 && s < 71);
  });

  test("0 → 0", () => {
    assert.equal(scoreReliability(0), 0);
  });
});

describe("scoreFeatureMatch", () => {
  test("exact intent match → 100", () => {
    assert.equal(scoreFeatureMatch(openAI, { intent: "chat" }), 100);
  });

  test("no match → 30", () => {
    assert.equal(scoreFeatureMatch(replicate, { intent: "speech-to-text" }), 30);
  });

  test("partial match → 70", () => {
    assert.equal(scoreFeatureMatch(comfyUI, { intent: "image" }), 70);
  });
});

describe("scorePreference", () => {
  test("preferred provider → 30", () => {
    assert.equal(scorePreference("openai", ["openai", "groq"]), 30);
  });

  test("not preferred → 0", () => {
    assert.equal(scorePreference("openai", ["groq"]), 0);
  });

  test("no preference list → 0", () => {
    assert.equal(scorePreference("openai", undefined), 0);
  });
});

// ─── Strategy Tests ──────────────────────────────────────────────────────────

describe("getStrategies", () => {
  test("returns 5 strategies", () => {
    const strategies = getStrategies();
    assert.equal(strategies.length, 5);
    const ids = strategies.map((s) => s.id);
    assert.deepEqual(ids, ["cheap", "fast", "quality", "balanced", "cost-capped"]);
  });
});

describe("getStrategy", () => {
  test("returns strategy by id", () => {
    const s = getStrategy("fast");
    assert.ok(s);
    assert.equal(s.name, "速度优先");
  });

  test("undefined for unknown id", () => {
    assert.equal(getStrategy("unknown" as any), undefined);
  });
});

// ─── Routing Tests ───────────────────────────────────────────────────────────

describe("route — basic selection", () => {
  test("cheap strategy selects comfyui ($0.001) over replicate ($0.005)", () => {
    const result = route(ALL_PROVIDERS, { intent: "text-to-image" }, "cheap");
    assert.equal(result.provider, "comfyui");
  });

  test("fast strategy selects groq (80ms) for chat", () => {
    const result = route(ALL_PROVIDERS, { intent: "chat" }, "fast");
    assert.equal(result.provider, "groq");
  });

  test("quality strategy selects openai (0.995 reliability + structured output) for chat", () => {
    const result = route(ALL_PROVIDERS, { intent: "chat" }, "quality");
    assert.equal(result.provider, "openai");
  });

  test("balanced selects a provider with positive score", () => {
    const result = route(ALL_PROVIDERS, { intent: "chat" }, "balanced");
    assert.ok(result.provider.length > 0);
    assert.ok(result.score.totalScore > 0);
  });
});

describe("route — preference boosting", () => {
  test("preferred provider gets higher score", () => {
    const withoutPref = route(ALL_PROVIDERS, { intent: "chat" }, "balanced");
    const withPref = route(ALL_PROVIDERS, {
      intent: "chat",
      preferredProviders: ["anthropic"],
    }, "balanced");

    const anthropicWithout = withoutPref.candidates.find((c) => c.provider === "anthropic")!.totalScore;
    const anthropicWith = withPref.candidates.find((c) => c.provider === "anthropic")!.totalScore;
    assert.ok(anthropicWith >= anthropicWithout);
  });
});

describe("route — constraint filtering", () => {
  test("maxCost filters expensive providers", () => {
    const result = route(ALL_PROVIDERS, { intent: "chat", maxCost: 0.02 }, "balanced");
    // Groq costs $0.01, OpenAI costs $0.15 — OpenAI should be filtered
    assert.equal(result.provider, "groq");
    assert.ok(result.explanation.filteredAfterConstraints > 0);
  });

  test("minReliability filters unreliable providers", () => {
    // ComfyUI has 0.89 reliability
    const result = route(ALL_PROVIDERS, {
      intent: "text-to-image",
      minReliability: 0.9,
    }, "balanced");
    assert.notEqual(result.provider, "comfyui");
  });
});

describe("route — failover chain", () => {
  test("records failover when preferred provider is outscored", () => {
    const result = route(ALL_PROVIDERS, {
      intent: "chat",
      preferredProviders: ["anthropic"],
    }, "fast");
    // Groq is fastest, so anthropic gets outscored on fast strategy
    if (result.provider !== "anthropic") {
      assert.ok(result.explanation.failoverChain);
      assert.equal(result.explanation.failoverChain![0].from, "anthropic");
    }
  });
});

describe("route — no candidates", () => {
  test("returns empty result when cost cap is too low", () => {
    // All chat providers cost > $0.001
    const result = route(ALL_PROVIDERS, { intent: "chat", maxCost: 0.001 }, "balanced");
    assert.equal(result.provider, "");
    assert.equal(result.candidates.length, 0);
  });
});

describe("route — scoring transparency", () => {
  test("candidates sorted by totalScore descending", () => {
    const result = route(ALL_PROVIDERS, { intent: "chat" }, "balanced");
    for (let i = 1; i < result.candidates.length; i++) {
      assert.ok(result.candidates[i - 1].totalScore >= result.candidates[i].totalScore);
    }
  });

  test("each candidate has all dimension scores", () => {
    const result = route(ALL_PROVIDERS, { intent: "chat" }, "balanced");
    for (const c of result.candidates) {
      assert.ok(typeof c.dimensions.cost === "number");
      assert.ok(typeof c.dimensions.latency === "number");
      assert.ok(typeof c.dimensions.reliability === "number");
      assert.ok(typeof c.dimensions.featureMatch === "number");
    }
  });
});

describe("route — cost-capped strategy", () => {
  test("cost-capped selects groq ($0.01) for chat", () => {
    const result = route(ALL_PROVIDERS, { intent: "chat" }, "cost-capped");
    assert.equal(result.provider, "groq");
  });
});

describe("weightedTotal", () => {
  test("default weights → weighted average", () => {
    const dims = { cost: 100, latency: 50, reliability: 50, featureMatch: 50, preference: 0 };
    const total = weightedTotal(dims, {});
    // (100+50+50+50+0) / (1+1+1+1+0.5) = 250 / 4.5 = 55.56
    assert.ok(total > 54 && total < 58);
  });

  test("custom weights skew result toward weighted dimension", () => {
    const dims = { cost: 100, latency: 0, reliability: 0, featureMatch: 0, preference: 0 };
    const heavyCost = weightedTotal(dims, { cost: 5, latency: 0.1 });
    assert.ok(heavyCost > 60);  // Default weights still factor in but cost dominates
  });
});

// ─── Phase 2: Exclude Filter ──────────────────────────────────────────────────

describe("excludeProviders", () => {
  test("excluded provider is not considered", () => {
    const result = route(ALL_PROVIDERS, {
      intent: "chat",
      excludeProviders: ["groq"],
    }, "fast");
    assert.notEqual(result.provider, "groq");
    // Should fall to next fastest chat provider
    assert.equal(result.provider, "openai");
  });

  test("exclude all matching providers returns empty", () => {
    const result = route(ALL_PROVIDERS, {
      intent: "chat",
      excludeProviders: ["openai", "anthropic", "groq"],
    }, "balanced");
    assert.equal(result.provider, "");
  });

  test("empty exclude list does nothing", () => {
    const result = route(ALL_PROVIDERS, { intent: "chat", excludeProviders: [] }, "fast");
    assert.ok(result.provider.length > 0);
  });
});

// ─── Phase 2: Region Bonus ───────────────────────────────────────────────────

describe("region match", () => {
  const usEastOpenAI: ProviderCapability = {
    ...openAI,
    region: "us-east",
  };
  const euWestOpenAI: ProviderCapability = {
    ...openAI,
    id: "openai-eu",
    name: "OpenAI EU",
    region: "eu-west",
  };
  const usWestGroq: ProviderCapability = {
    ...groq,
    region: "us-west",
  };
  const regionProviders = [usEastOpenAI, euWestOpenAI, usWestGroq];

  test("exact region match boosts preferred provider", () => {
    // With region bonus, the us-east provider should have higher latency score
    // than the eu-west provider (all else being equal)
    const usEastScore = usEastOpenAI;
    const euWestScore = euWestOpenAI;
    const result = route([usEastScore, euWestScore], { intent: "chat", region: "us-east" }, "balanced");
    // us-east matched provider should score higher
    const usEast = result.candidates.find(c => c.provider === "openai")!;
    const euWest = result.candidates.find(c => c.provider === "openai-eu")!;
    assert.ok(usEast.dimensions.latency > euWest.dimensions.latency);
  });

  test("prefix region match gives partial bonus", () => {
    const result = route(regionProviders, { intent: "chat", region: "eu-central" }, "fast");
    // eu prefix matches eu-west, so openai-eu should have a latency boost
    const euLatency = result.candidates.find(c => c.provider === "openai-eu")!.dimensions.latency;
    const baseLatency = scoreLatency("quality");
    assert.ok(euLatency >= baseLatency);
  });

  test("no region preference does nothing", () => {
    const result = route(regionProviders, { intent: "chat" }, "fast");
    assert.ok(result.provider.length > 0);
  });
});

// ─── Phase 2: Version Filter ─────────────────────────────────────────────────

describe("version filter", () => {
  const gpt4: ProviderCapability = {
    ...openAI,
    version: "4.0",
  };
  const gpt35: ProviderCapability = {
    ...openAI,
    id: "openai-gpt35",
    name: "OpenAI GPT-3.5",
    version: "3.5",
    features: [{
      id: "chat_post_v1_chat_completions",
      intent: "chat",
      costPerUnit: 0.01,
      estimatedLatencyMs: 200,
    }],
  };

  test("minVersion filters out older providers", () => {
    const result = route([gpt4, gpt35], { intent: "chat", minVersion: "4.0" }, "balanced");
    // GPT-3.5 should have featureMatch ≤ 30, so it's excluded
    const gpt35Cand = result.candidates.find(c => c.provider === "openai-gpt35");
    assert.equal(gpt35Cand, undefined);
  });

  test("minVersion passes compatible providers", () => {
    const result = route([gpt4, gpt35], { intent: "chat", minVersion: "3.0" }, "balanced");
    const candidates = result.candidates.map(c => c.provider);
    assert.ok(candidates.includes("openai"));
    assert.ok(candidates.includes("openai-gpt35"));
  });

  test("no minVersion does nothing", () => {
    const result = route([gpt4, gpt35], { intent: "chat" }, "balanced");
    assert.ok(result.candidates.length >= 2);
  });
});

// ─── Phase 2: Custom Strategies ──────────────────────────────────────────────

describe("registerCustomStrategy", () => {
  test("registers a custom strategy that can be used in route()", () => {
    registerCustomStrategy({
      id: "custom-test",
      name: "Test Custom",
      description: "Only cares about cost",
      weights: { cost: 10, latency: 0.1, reliability: 0.1, featureMatch: 0.1 },
    });

    const result = route(ALL_PROVIDERS, { intent: "chat" }, "custom-test");
    assert.ok(result.provider.length > 0);
    assert.equal(result.strategy, "custom-test");

    // Cleanup
    unregisterCustomStrategy("custom-test");
  });

  test("custom strategy cannot override built-in", () => {
    assert.throws(() => {
      registerCustomStrategy({
        id: "fast",
        name: "Hack",
        description: "trying to override",
        weights: { cost: 100 },
      });
    });
  });
});

describe("registerCustomStrategies", () => {
  test("registers multiple strategies at once", () => {
    registerCustomStrategies([
      {
        id: "latency-only",
        name: "Latency Only",
        description: "Pure latency focus",
        weights: { latency: 10 },
      },
      {
        id: "reliability-only",
        name: "Reliability Only",
        description: "Pure reliability focus",
        weights: { reliability: 10 },
      },
    ]);

    assert.ok(getStrategy("latency-only"));
    assert.ok(getStrategy("reliability-only"));

    unregisterCustomStrategy("latency-only");
    unregisterCustomStrategy("reliability-only");
  });
});

describe("unregisterCustomStrategy", () => {
  test("removes a previously registered strategy", () => {
    registerCustomStrategy({
      id: "temp",
      name: "Temporary",
      description: "will be removed",
      weights: { cost: 1 },
    });
    assert.ok(getStrategy("temp"));

    unregisterCustomStrategy("temp");
    assert.equal(getStrategy("temp"), undefined);
  });
});

describe("getStrategies with custom strategies", () => {
  test("includes both built-in and custom strategies", () => {
    registerCustomStrategy({
      id: "custom-count-test",
      name: "Count Test",
      description: "for counting",
      weights: { cost: 1 },
    });

    const all = getStrategies();
    const ids = all.map(s => s.id);
    assert.ok(ids.includes("cheap"));
    assert.ok(ids.includes("custom-count-test"));

    unregisterCustomStrategy("custom-count-test");
  });
});

describe("integration — full routing pipeline", () => {
  test("all 5 strategies find a provider for text-to-image", () => {
    const strategies = ["cheap", "fast", "quality", "balanced", "cost-capped"] as const;
    for (const strategy of strategies) {
      const result = route(ALL_PROVIDERS, { intent: "text-to-image" }, strategy);
      assert.ok(result.provider.length > 0, `strategy ${strategy} should find a provider`);
      assert.ok(result.score.totalScore > 0, `strategy ${strategy} should have positive score`);
    }
  });

  test("chat routing — groq fastest, openai best quality", () => {
    const fastResult = route(ALL_PROVIDERS, { intent: "chat" }, "fast");
    const qualityResult = route(ALL_PROVIDERS, { intent: "chat" }, "quality");

    assert.equal(fastResult.provider, "groq");       // 80ms → fastest
    assert.equal(qualityResult.provider, "openai");  // 0.995 reliability + structured output
  });

  test("chat providers are properly identified", () => {
    const result = route(ALL_PROVIDERS, { intent: "chat" }, "balanced");
    const exactChatMatch = result.candidates.filter(
      (c) => c.dimensions.featureMatch === 100,
    );
    assert.equal(exactChatMatch.length, 3); // openai, anthropic, groq
  });
});
