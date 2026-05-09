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
  CustomStrategyConfig,
} from "./types.js";
import { scoreProvider, weightedTotal } from "./scorer.js";

// ─── 预置策略 ──────────────────────────────────────────────────────────────

const STRATEGIES: Record<string, RoutingStrategy> = {
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
    filters: { maxCost: 0.01 },
  },
};

// ─── 自定义策略存储 ────────────────────────────────────────────────────────

const customStrategies = new Map<string, RoutingStrategy>();

/**
 * 注册自定义策略。可由 CLI 的 `synapse config set route.strategies.xxx` 调用。
 * 同 id 的预置策略不会被覆盖。
 */
export function registerCustomStrategy(config: CustomStrategyConfig): void {
  if (STRATEGIES[config.id]) {
    throw new Error(
      `Cannot override built-in strategy "${config.id}". Use a different id.`,
    );
  }
  customStrategies.set(config.id, {
    id: config.id,
    name: config.name,
    description: config.description,
    weights: config.weights,
    filters: {
      maxCost: config.maxCost,
      minReliability: config.minReliability,
    },
  });
}

/**
 * 批量注册自定义策略（从 config 加载）。
 */
export function registerCustomStrategies(configs: CustomStrategyConfig[]): void {
  for (const config of configs) {
    registerCustomStrategy(config);
  }
}

/**
 * 移除自定义策略。
 */
export function unregisterCustomStrategy(id: string): boolean {
  return customStrategies.delete(id);
}

// ─── 排名引擎 ──────────────────────────────────────────────────────────────

function resolveStrategy(strategyId: StrategyId): RoutingStrategy {
  const builtin = STRATEGIES[strategyId];
  if (builtin) return builtin;

  const custom = customStrategies.get(strategyId);
  if (custom) return custom;

  // Fallback to balanced
  console.error(`Unknown strategy "${strategyId}", falling back to "balanced"`);
  return STRATEGIES.balanced;
}

/**
 * 主路由函数：对候选 Provider 进行评分 → 过滤 → 排序 → 选最优。
 */
export function route(
  providers: ProviderCapability[],
  request: RoutingRequest,
  strategyId: StrategyId = "balanced",
): RouteResult {
  const strategy = resolveStrategy(strategyId);

  // 第 1 步：显式排除
  const { included, excluded } = applyExclusion(providers, request);

  // 第 2 步：评分所有剩余 Provider
  const scoredAll = included.map((p) => {
    const matchedFeature = findBestMatchingFeature(p, request);
    const dimensions = scoreProvider(p, request, matchedFeature);

    // 地区匹配加分：region 匹配 +15，不在列表不加不减
    const regionBonus = applyRegionBonus(p, request);
    if (regionBonus > 0) {
      dimensions.latency = Math.min(100, dimensions.latency + regionBonus);
    }

    // 版本过滤（功能层面）：不满足 minVersion 的降级 featureMatch
    const versionMatch = checkVersionMatch(p, request);
    if (!versionMatch) {
      dimensions.featureMatch = Math.min(dimensions.featureMatch, 30);
    }

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

  // 第 3 步：预过滤 — 完全不匹配 intent 的 Provider 排除
  const matchedOnly = scoredAll.filter((s) => s.dimensions.featureMatch > 30);
  const intentDropped = scoredAll.length - matchedOnly.length;

  // 第 4 步：应用约束过滤
  const filtered = applyFilters(matchedOnly, request, strategy);
  const passing = filtered.passed;

  // 第 5 步：按总分降序排列
  passing.sort((a, b) => b.totalScore - a.totalScore);

  // 第 6 步：failover 链（记录降级原因）
  const failoverChain: RouteResult["explanation"]["failoverChain"] = [];
  if (passing.length > 0) {
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

  // 第 7 步：构建结果
  const selected = passing.length > 0 ? passing[0] : undefined;

  if (!selected) {
    const allDropped = [
      ...excluded.map((d) => `${d.id}: explicitly excluded`),
      ...filtered.dropped.map((d) => `${d.provider}: ${d.reason}`),
      ...(intentDropped > 0 ? [`${intentDropped} provider(s) excluded: intent mismatch`] : []),
    ];
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
        filteredAfterConstraints: allDropped.length,
        strategyWeights: strategy.weights,
        failoverChain: [{ from: "all", reason: allDropped.join("; ") }],
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
      filteredAfterConstraints: filtered.dropped.length + excluded.length,
      strategyWeights: strategy.weights,
      failoverChain: failoverChain.length > 0 ? failoverChain : undefined,
    },
  };
}

// ─── 过滤辅助函数 ──────────────────────────────────────────────────────────

function applyExclusion(
  providers: ProviderCapability[],
  request: RoutingRequest,
): { included: ProviderCapability[]; excluded: ProviderCapability[] } {
  if (!request.excludeProviders?.length) {
    return { included: providers, excluded: [] };
  }
  const excludeSet = new Set(request.excludeProviders);
  const included: ProviderCapability[] = [];
  const excluded: ProviderCapability[] = [];
  for (const p of providers) {
    if (excludeSet.has(p.id)) {
      excluded.push(p);
    } else {
      included.push(p);
    }
  }
  return { included, excluded };
}

function applyRegionBonus(
  provider: ProviderCapability,
  request: RoutingRequest,
): number {
  if (!request.region || !provider.region) return 0;
  // 精确地区匹配 +15
  if (provider.region === request.region) return 15;
  // 地区前缀匹配（如 us-east 匹配 us-east-1）+10
  const reqPrefix = request.region.split("-")[0];
  const provPrefix = provider.region.split("-")[0];
  if (reqPrefix && provPrefix && reqPrefix === provPrefix) return 10;
  return 0;
}

function checkVersionMatch(
  provider: ProviderCapability,
  request: RoutingRequest,
): boolean {
  if (!request.minVersion || !provider.version) return true;
  return compareVersions(provider.version, request.minVersion) >= 0;
}

function compareVersions(a: string, b: string): number {
  // 简单语义化版本比较（只比较前两个 segment）
  const aParts = a.split(".").map((s) => parseInt(s, 10));
  const bParts = b.split(".").map((s) => parseInt(s, 10));

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aNum = aParts[i] ?? 0;
    const bNum = bParts[i] ?? 0;
    if (aNum > bNum) return 1;
    if (aNum < bNum) return -1;
  }
  return 0;
}

function applyFilters(
  scored: ScoredProvider[],
  request: RoutingRequest,
  strategy: RoutingStrategy,
): FilterResult {
  const passed: ScoredProvider[] = [];
  const dropped: FilterResult["dropped"] = [];

  for (const item of scored) {
    const reasons: string[] = [];

    // 请求级别的 maxCost
    if (request.maxCost !== undefined && item.estimate?.costUsd !== undefined) {
      if (item.estimate.costUsd > request.maxCost) {
        reasons.push(`cost ${item.estimate.costUsd} exceeds maxCost ${request.maxCost}`);
      }
    }

    // 策略级别的 maxCost
    if (strategy.filters?.maxCost !== undefined && item.estimate?.costUsd !== undefined) {
      if (item.estimate.costUsd > strategy.filters.maxCost) {
        reasons.push(`cost ${item.estimate.costUsd} exceeds strategy maxCost ${strategy.filters.maxCost}`);
      }
    }

    // 请求级别的 minReliability
    if (request.minReliability !== undefined) {
      const reliability = (item.dimensions.reliability - 50) / 50;
      if (reliability < request.minReliability) {
        reasons.push(`reliability ${reliability.toFixed(2)} below min ${request.minReliability}`);
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

  // 模糊匹配
  return provider.features.find(
    (f) =>
      f.id.toLowerCase().includes(intent) ||
      intent.includes(f.intent.toLowerCase()),
  );
}

// ─── 策略查询 ──────────────────────────────────────────────────────────────

export function getStrategies(): RoutingStrategy[] {
  return [...Object.values(STRATEGIES), ...Array.from(customStrategies.values())];
}

export function getStrategy(id: StrategyId): RoutingStrategy | undefined {
  return STRATEGIES[id] ?? customStrategies.get(id);
}
