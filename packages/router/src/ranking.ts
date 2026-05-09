/**
 * @synapse-router/router — 路由策略定义 + 排名引擎
 *
 * Paradigm 层: 声明式策略到权重向量的映射
 * Adaptation 层: 实时感知 failover/downgrade（基于多维度评分）
 */
import type {
  RoutingRequest,
  ProviderCapability,
  ScoredProvider,
  RouteResult,
  FilterResult,
  DimensionScores,
  RoutingStrategy,
  StrategyId,
} from "./types.js";
import { scoreProvider, weightedTotal } from "./scorer.js";

// ─── 预置策略 ──────────────────────────────────────────────────────────────

const STRATEGIES: Record<StrategyId, RoutingStrategy> = {
  cheap: {
    id: "cheap",
    name: "成本优先",
    description: "优先选择成本最低的 Provider，适合成本敏感场景",
    weights: { cost: 5, latency: 1, reliability: 1, featureMatch: 1, preference: 0.5 },
  },
  fast: {
    id: "fast",
    name: "速度优先",
    description: "优先选择延迟最低的 Provider，适合实时交互场景",
    weights: { cost: 1, latency: 5, reliability: 1, featureMatch: 1, preference: 0.5 },
  },
  quality: {
    id: "quality",
    name: "质量优先",
    description: "优先选择可靠性最高、功能匹配最完整的 Provider",
    weights: { cost: 0.25, latency: 0.25, reliability: 6, featureMatch: 4, preference: 0.5 },
  },
  balanced: {
    id: "balanced",
    name: "均衡策略",
    description: "在成本、速度、可靠性之间取均衡",
    weights: { cost: 1, latency: 1, reliability: 1, featureMatch: 1, preference: 0.5 },
  },
  "cost-capped": {
    id: "cost-capped",
    name: "预算封顶",
    description: "在预算约束内选择最佳的 Provider",
    weights: { cost: 3, latency: 1, reliability: 2, featureMatch: 2, preference: 0.5 },
    filters: { maxCost: 0.01 }, // 默认 0.01 美元/次封顶
  },
};

// ─── 排名引擎 ──────────────────────────────────────────────────────────────

/**
 * 主路由函数：对候选 Provider 进行评分 → 过滤 → 排序 → 选最优。
 *
 * 这是 Paradigm + Adaptation 两层的实现：
 * 1. 范式层: 根据策略权重计算多维度评分
 * 2. 适配层: 过滤不合理选项，failover 到次优
 */
export function route(
  providers: ProviderCapability[],
  request: RoutingRequest,
  strategyId: StrategyId = "balanced",
): RouteResult {
  const strategy = STRATEGIES[strategyId];

  // 第 1 步：评分所有 Provider
  const scoredAll = providers.map((p) => {
    const matchedFeature = findBestMatchingFeature(p, request);
    const dimensions = scoreProvider(p, request, matchedFeature);
    const totalScore = weightedTotal(dimensions, strategy.weights);

    return {
      provider: p.id,
      totalScore,
      dimensions,
      estimate: {
        costUsd: matchedFeature?.costPerUnit,
        latencyMs: matchedFeature?.estimatedLatencyMs,
      },
    };
  });

  // 第 2 步：预过滤 — 完全不匹配 intent 的 Provider 排除
  const matchedOnly = scoredAll.filter((s) => s.dimensions.featureMatch > 30);
  const intentDropped = scoredAll.length - matchedOnly.length;

  // 第 3 步：应用约束过滤
  const filtered = applyFilters(matchedOnly, request, strategy);
  const passing = filtered.passed;

  // 第 4 步：按总分降序排列
  passing.sort((a, b) => b.totalScore - a.totalScore);

  // 第 4 步：failover 链（记录降级原因）
  const failoverChain: RouteResult["explanation"]["failoverChain"] = [];
  if (passing.length > 0) {
    // 如果首选 (最高分) 不在 preferredProviders 中，记录原因
    const top = passing[0];
    if (
      request.preferredProviders?.length &&
      !request.preferredProviders.includes(top.provider)
    ) {
      failoverChain.push({
        from: request.preferredProviders[0],
        reason: `preferred provider scored lower than ${top.provider}`,
      });
    }
  }

  // 第 5 步：构建结果
  const selected = passing.length > 0 ? passing[0] : undefined;

  if (!selected) {
    // 无可用 Provider：返回失败信息
    return {
      provider: "",
      score: {
        provider: "",
        totalScore: 0,
        dimensions: { cost: 0, latency: 0, reliability: 0, featureMatch: 0, preference: 0 },
      },
      candidates: [],
      strategy: strategyId,
      explanation: {
        intent: request.intent,
        totalCandidates: providers.length,
        filteredAfterConstraints: 0,
        strategyWeights: strategy.weights,
        failoverChain: [
          {
            from: "all",
            reason: filtered.dropped.map((d) => `${d.provider}: ${d.reason}`).join("; "),
          },
        ],
      },
    };
  }

  return {
    provider: selected.provider,
    score: selected,
    candidates: passing,
    strategy: strategyId,
    explanation: {
      intent: request.intent,
      totalCandidates: providers.length,
      filteredAfterConstraints: filtered.dropped.length,
      strategyWeights: strategy.weights,
      failoverChain: failoverChain.length > 0 ? failoverChain : undefined,
    },
  };
}

// ─── 辅助函数 ──────────────────────────────────────────────────────────────

function applyFilters(
  scored: ScoredProvider[],
  request: RoutingRequest,
  strategy: RoutingStrategy,
): FilterResult {
  const passed: ScoredProvider[] = [];
  const dropped: FilterResult["dropped"] = [];

  for (const item of scored) {
    const reasons: string[] = [];

    // 请求级别的 maxCost 过滤
    if (request.maxCost !== undefined && item.estimate?.costUsd !== undefined) {
      if (item.estimate.costUsd > request.maxCost) {
        reasons.push(`cost ${item.estimate.costUsd} exceeds maxCost ${request.maxCost}`);
      }
    }

    // 策略级别的 maxCost 过滤
    if (strategy.filters?.maxCost !== undefined && item.estimate?.costUsd !== undefined) {
      if (item.estimate.costUsd > strategy.filters.maxCost) {
        reasons.push(
          `cost ${item.estimate.costUsd} exceeds strategy maxCost ${strategy.filters.maxCost}`,
        );
      }
    }

    // 请求级别的 minReliability 过滤
    if (request.minReliability !== undefined) {
      // 将 reliability 分数 [0,100] 映射回 [0,1]
      const reliability = (item.dimensions.reliability - 50) / 50;
      if (reliability < request.minReliability) {
        reasons.push(
          `reliability ${reliability.toFixed(2)} below min ${request.minReliability}`,
        );
      }
    }

    if (reasons.length > 0) {
      dropped.push({ provider: item.provider, reason: reasons.join("; ") });
    } else {
      passed.push(item);
    }
  }

  return { passed, dropped };
}

function findBestMatchingFeature(
  provider: ProviderCapability,
  request: RoutingRequest,
) {
  if (!provider.features || provider.features.length === 0) return undefined;

  const intent = request.intent.toLowerCase();

  // 精确 intent 匹配
  const exact = provider.features.find(
    (f) => f.intent.toLowerCase() === intent,
  );
  if (exact) return exact;

  // 如果请求指定了 feature IDs
  if (request.supportedFeatureIds?.length) {
    const byId = provider.features.find((f) =>
      request.supportedFeatureIds!.includes(f.id),
    );
    if (byId) return byId;
  }

  // 模糊匹配：取第一个匹配 intent 的
  return provider.features.find(
    (f) =>
      f.id.toLowerCase().includes(intent) ||
      intent.includes(f.intent.toLowerCase()),
  );
}

export function getStrategies(): RoutingStrategy[] {
  return Object.values(STRATEGIES);
}

export function getStrategy(id: StrategyId): RoutingStrategy | undefined {
  return STRATEGIES[id];
}
