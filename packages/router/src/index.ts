/**
 * @synapse-router/router — 路由引擎
 *
 * 多维度评分路由引擎，支持 5 种策略 + 自定义策略：
 *   cheap: 成本优先
 *   fast: 速度优先
 *   quality: 质量优先
 *   balanced: 均衡策略（默认）
 *   cost-capped: 预算封顶
 *
 * 架构定位：
 *   - Paradigm 层: 声明式策略 → 权重向量
 *   - Adaptation 层: 实时评分 + failover
 *   - Evolution 层: 由 `synapse sdk generate` 离线完成（不在本包）
 *
 * 核心约束：
 *   - 纯函数，无运行时 LLM
 *   - 所有评分确定性的（相同输入 → 相同输出）
 *   - 路由决策可解释（返回完整 score + explanation）
 *
 * 注意（显式全局状态）：
 *   route()/getStrategies() 在只使用内置策略时是纯函数；但本模块额外导出
 *   registerCustomStrategy / registerCustomStrategies / unregisterCustomStrategy，
 *   它们写入模块级注册表，会让后续 route() 的结果依赖进程内注册历史。
 *   需要确定性的调用方应只使用 BUILTIN_STRATEGY_IDS，或在使用前显式注册并在
 *   结束后 unregister；测试中请在每个用例后清理，避免用例间相互污染。
 */

// 类型
export type {
  RoutingRequest,
  ProviderCapability,
  FeatureDescriptor,
  DimensionScores,
  ScoredProvider,
  RouteResult,
  FilterResult,
  RoutingStrategy,
  CustomStrategyConfig,
  StrategyId,
} from "./types.js";

export { BUILTIN_STRATEGY_IDS, Dimension } from "./types.js";

// 策略
// NOTE: the register*/unregister* helpers below mutate process-wide state —
// see the "显式全局状态" note in the module header.
export {
  getStrategies,
  getStrategy,
  route,
  registerCustomStrategy,
  registerCustomStrategies,
  unregisterCustomStrategy,
} from "./ranking.js";

// 评分（低级 API，供有自定义策略需求的用户使用）
export {
  scoreCost,
  scoreLatency,
  scoreReliability,
  scoreFeatureMatch,
  scorePreference,
  scoreProvider,
  weightedTotal,
} from "./scorer.js";

// 快捷 API
export { route as pickProvider } from "./ranking.js";
