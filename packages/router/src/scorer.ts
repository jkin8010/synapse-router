/**
 * @synapse-router/router — 多维评分引擎
 *
 * 为 Provider 在各维度上计算归一化 [0, 100] 分数。
 * 所有评分函数是纯函数：相同输入 → 相同输出。
 */
import type {
  ProviderCapability,
  FeatureDescriptor,
  DimensionScores,
  RoutingRequest,
} from "./types.js";

// ─── 维度评分函数 ──────────────────────────────────────────────────────────

/**
 * 成本评分。
 * 越低越贵 = 分数越低；无成本数据 = 中位分 50。
 * costPerUnit 以美元/千tokens 或按次计费，数值越小越好。
 */
export function scoreCost(feature?: FeatureDescriptor): number {
  if (feature?.costPerUnit === undefined) return 50;

  // 假设常见成本区间 [0.001, 10] USD/千tokens
  // 0.001 → 100, 0.005 → 86, 0.01 → 80, 0.1 → 60, 1 → 40, 10 → 20
  const cost = feature.costPerUnit;
  if (cost <= 0) return 100;
  const score = 100 - Math.log10(cost / 0.001) * 20;
  return clamp(score, 0, 100);
}

/**
 * 延迟评分。
 * latencyCategory 来自 Provider 层面的运营数据。
 * 结合 feature 级别的预估延迟（毫秒）做精细调整。
 */
export function scoreLatency(
  category: "cheap" | "fast" | "quality",
  featureEstimatedMs?: number,
): number {
  // Provider 级别的延迟分类 → 基础分
  const baseScore = latencyCategoryToScore(category);

  // 若有 feature 级别的预估，做 +/- 调整
  if (featureEstimatedMs !== undefined) {
    const msScore = latencyMsToScore(featureEstimatedMs);
    // 综合：60% 类别权重 + 40% 数据权重
    return clamp(baseScore * 0.6 + msScore * 0.4, 0, 100);
  }

  return baseScore;
}

/**
 * 可靠性评分。
 * reliability [0, 1] 映射到 [0, 100]。
 * 可靠性 0.99+ → 95+，0.95 → 80，0.90 → 60，0.80 → 40，<0.80 → 快速下降。
 */
export function scoreReliability(reliability: number): number {
  if (reliability >= 1) return 100;
  if (reliability <= 0) return 0;

  // 0.99^4*100=96, 0.95^4*100=81, 0.90^4*100=66, 0.80^4*100=41
  const score = Math.pow(reliability, 4) * 100;
  return clamp(score, 0, 100);
}

/**
 * 功能匹配评分。
 * 检查 intent 是否匹配，以及 feature 列表是否覆盖请求意图。
 * 精确匹配 → 100；模糊匹配 → 50~99；不匹配 → 0。
 */
export function scoreFeatureMatch(
  provider: ProviderCapability,
  request: RoutingRequest,
): number {
  if (!provider.features || provider.features.length === 0) return 0;

  const intent = request.intent.toLowerCase();

  // 精确匹配 intent
  const exactMatch = provider.features.some(
    (f) => f.intent.toLowerCase() === intent,
  );
  if (exactMatch) return 100;

  // 模糊匹配（intent 包含于 feature name / description）
  const partialMatch = provider.features.some(
    (f) =>
      f.id.toLowerCase().includes(intent) ||
      intent.includes(f.intent.toLowerCase()),
  );
  if (partialMatch) return 70;

  // 仅支持相同 modality
  return 30;
}

/**
 * 用户偏好评分。
 * preferredProviders 列表中的 Provider 获得 +30 分加成。
 */
export function scorePreference(
  providerId: string,
  preferredProviders?: string[],
): number {
  if (!preferredProviders || preferredProviders.length === 0) return 0;
  return preferredProviders.includes(providerId) ? 30 : 0;
}

// ─── 综合评分 ──────────────────────────────────────────────────────────────

/**
 * 对单个 Provider 计算完整的多维度评分。
 */
export function scoreProvider(
  provider: ProviderCapability,
  request: RoutingRequest,
  matchedFeature?: FeatureDescriptor,
): DimensionScores {
  return {
    cost: scoreCost(matchedFeature),
    latency: scoreLatency(
      provider.performance.latencyCategory,
      matchedFeature?.estimatedLatencyMs,
    ),
    reliability: scoreReliability(provider.performance.reliability),
    featureMatch: scoreFeatureMatch(provider, request),
    preference: scorePreference(provider.id, request.preferredProviders),
  };
}

/**
 * 加权汇总各维度分数。
 */
export function weightedTotal(
  dimensions: DimensionScores,
  weights: Partial<DimensionScores>,
): number {
  const defaultWeights: DimensionScores = {
    cost: 1,
    latency: 1,
    reliability: 1,
    featureMatch: 1,
    preference: 0.5,
  };

  const w = { ...defaultWeights, ...weights };
  const sum = Object.keys(dimensions).reduce((acc, key) => {
    const k = key as keyof DimensionScores;
    return acc + dimensions[k] * w[k];
  }, 0);

  const totalWeight = Object.values(w).reduce((a, b) => a + b, 0);
  return totalWeight > 0 ? sum / totalWeight : 0;
}

// ─── 辅助函数 ──────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function latencyCategoryToScore(category: string): number {
  switch (category) {
    case "fast":
      return 90;
    case "cheap":
      return 60;
    case "quality":
      return 40;
    default:
      return 50;
  }
}

function latencyMsToScore(ms: number): number {
  // 50ms → 95, 200ms → 80, 500ms → 60, 1s → 40, 3s → 20, 10s → 5
  if (ms <= 0) return 100;
  if (ms >= 30_000) return 0;
  return clamp(100 - Math.log2(ms / 50) * 15, 0, 100);
}
