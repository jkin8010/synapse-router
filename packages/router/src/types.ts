/**
 * @synapse-router/router — 路由引擎类型定义
 *
 * 三范式路由架构：
 *   Paradigm 层: 声明式规则（策略 → Provider 偏好映射）
 *   Adaptation 层: 实时感知（failover/downgrade，基于多维度评分）
 *   Evolution 层: 离线学习（synapse evolve，不在本包中）
 */

// ─── 路由请求 ────────────────────────────────────────────────────────────────

export interface RoutingRequest {
  /** 使用者意图描述（如 "chat"、"text-to-image"、"text-generation"） */
  intent: string;

  /** Provider 支持的 feature ID 列表（来自 provider-card.json） */
  supportedFeatureIds?: string[];

  /** 最高可接受成本（单位：美元），成本预估超过此值的 Provider 被过滤 */
  maxCost?: number;

  /** 最低可靠性阈值 0~1，低于此值的 Provider 被过滤 */
  minReliability?: number;

  /** 是否需要结构化输出能力 */
  requireStructuredOutput?: boolean;

  /** 优先选择的 Provider（排序时提权，但不会绕过上述过滤条件） */
  preferredProviders?: string[];

  // ─── Phase 2: 增强过滤 ──────────────────────────────────────────────────────

  /** 显式排除的 Provider 列表（完全排除，不参与评分） */
  excludeProviders?: string[];

  /** 偏好地区（如 "us-east"、"eu-west"、"apac"），会影响延迟评分 */
  region?: string;

  /** 最低模型版本（如 "3.5"、"4.0"），通过 feature ID 字符串比较 */
  minVersion?: string;
}

// ─── Provider 能力描述 ──────────────────────────────────────────────────────

export interface ProviderCapability {
  /** Provider 唯一标识符 */
  id: string;

  /** 显示名称 */
  name: string;

  /** 支持的功能列表 */
  features: FeatureDescriptor[];

  /** Provider 层面的性能特征 */
  performance: {
    /** 延迟等级 */
    latencyCategory: "cheap" | "fast" | "quality";
    /** 可靠性 0~1 */
    reliability: number;
  };

  // ─── Phase 2: 增强描述 ──────────────────────────────────────────────────────

  /** Provider 部署地区（如 "us-east"、"eu-west"、"apac"），影响延迟评分 */
  region?: string;

  /** 模型版本号（如 "gpt-4o-mini-2024-07-18"），用于版本比较 */
  version?: string;
}

export interface FeatureDescriptor {
  /** Feature ID（如 "chat_post_v1_chat_completions"） */
  id: string;

  /** 意图类型（如 "chat"、"text-to-image"、"embeddings"） */
  intent: string;

  /** Feature 级别的成本系数（美元/千tokens，或按次） */
  costPerUnit?: number;

  /** Feature 级别的延迟预估（毫秒） */
  estimatedLatencyMs?: number;

  /** Feature 级别是否支持结构化输出 */
  supportsStructuredOutput?: boolean;
}

// ─── 评分维度 ───────────────────────────────────────────────────────────────

export enum Dimension {
  Cost = "cost",
  Latency = "latency",
  Reliability = "reliability",
  FeatureMatch = "featureMatch",
  Preference = "preference",
}

/** 各维度评分值归一化到 [0, 100] */
export interface DimensionScores {
  cost: number;
  latency: number;
  reliability: number;
  featureMatch: number;
  preference: number;
}

// ─── 策略定义 ───────────────────────────────────────────────────────────────

export const BUILTIN_STRATEGY_IDS = [
  "cheap", "fast", "quality", "balanced", "cost-capped",
] as const;

export type StrategyId = typeof BUILTIN_STRATEGY_IDS[number] | (string & {});

/** 策略 = 各维度的权重向量 + 附加约束 */
export interface RoutingStrategy {
  id: StrategyId;
  name: string;
  description: string;
  weights: Partial<DimensionScores>;
  filters?: {
    /** 最高成本过滤（策略级别，可覆盖请求级别的 maxCost） */
    maxCost?: number;
    /** 最低可靠性过滤 */
    minReliability?: number;
  };
}

/**
 * 自定义策略配置（用户可持久化保存的格式）。
 * 与 CLI config 联动。
 */
export interface CustomStrategyConfig {
  id: string;
  name: string;
  description: string;
  weights: Partial<DimensionScores>;
  maxCost?: number;
  minReliability?: number;
}

// ─── 路由结果 ───────────────────────────────────────────────────────────────

export interface ScoredProvider {
  /** Provider ID */
  provider: string;

  /** 归一化总分 [0, 100] */
  totalScore: number;

  /** 各维度评分明细 */
  dimensions: DimensionScores;

  /** 成本/延迟预估（若有定价数据） */
  estimate?: {
    /** 预估单次调用成本（美元） */
    costUsd?: number;
    /** 预估延迟（毫秒） */
    latencyMs?: number;
  };
}

export interface RouteResult {
  /** 选中 Provider */
  provider: string;

  /** 选中 Provider 的完整评分 */
  score: ScoredProvider;

  /** 所有候选项（按分数降序排列），含选中项 */
  candidates: ScoredProvider[];

  /** 使用的策略 */
  strategy: StrategyId;

  /** 路由决策的解释记录 */
  explanation: {
    intent: string;
    totalCandidates: number;
    filteredAfterConstraints: number;
    strategyWeights: Partial<DimensionScores>;
    /** failover 链（若发生降级或 failover） */
    failoverChain?: Array<{
      from: string;
      reason: string;
    }>;
  };
}

// ─── 过滤结果 ───────────────────────────────────────────────────────────────

export interface FilterResult {
  passed: ScoredProvider[];
  dropped: Array<{
    provider: string;
    reason: string;
  }>;
}
