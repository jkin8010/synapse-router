---
sidebar_position: 3
title: synapse route
---

# synapse route — 多维评分路由

route 命令对候选 Provider 进行多维度评分（Multi-Dimensional Scoring）、过滤和排序，选择最优 Provider。路由是纯函数（Pure Function），相同输入始终得到相同输出。支持 5 种内置策略和自定义策略。

## 参数 (Parameters)

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `<intent>` | string | 是 | — | 意图类型（如 `chat`, `text-to-image`） |
| `--strategy <s>` | string | 否 | `balanced` | 路由策略：`cheap` / `fast` / `quality` / `balanced` / `cost-capped` |
| `--exclude <ids>` | string | 否 | — | 排除的 Provider 列表（逗号分隔） |
| `--region <region>` | string | 否 | — | 偏好地区（如 `us-east`, `eu-west`, `apac`） |
| `--min-version <v>` | string | 否 | — | 最低模型版本（如 `3.5`, `4.0`） |

## 路由策略 (Routing Strategies)

系统提供 5 种内置策略，每种策略在不同评分维度上有不同的权重分布：

| 策略 ID | 名称 | 权重分布 (cost/latency/reliability/featureMatch/preference) | 适用场景 |
|---------|------|------------------------------------------------------------|---------|
| `cheap` | 成本优先 | 5 / 1 / 1 / 1 / 0.5 | 成本敏感型场景 |
| `fast` | 速度优先 | 1 / 5 / 1 / 1 / 0.5 | 实时交互场景 |
| `quality` | 质量优先 | 0.25 / 0.25 / 6 / 4 / 0.5 | 质量关键型场景 |
| `balanced` | 均衡策略（默认） | 1 / 1 / 1 / 1 / 0.5 | 通用场景 |
| `cost-capped` | 预算封顶 | 3 / 1 / 2 / 2 / 0.5 (+ maxCost 过滤) | 有预算约束的场景 |

自定义策略可通过 `synapse config set route.strategies.<name>` 注册。

## 评分维度 (Scoring Dimensions)

每个候选 Provider 在 5 个维度上评分，归一化到 [0, 100]：

- **cost (成本)** — Feature 级别成本系数 + 输入规模预估
- **latency (延迟)** — Provider 延迟等级（cheap/fast/quality）+ 地区匹配加分
- **reliability (可靠性)** — Provider 可靠性系数 0~1
- **featureMatch (功能匹配)** — Intent 精确/模糊匹配 + 地区前缀 + 版本过滤
- **preference (偏好)** — 用户指定的 preferredProviders 提权

加权总分公式：`totalScore = Σ(dimensionScore × weight)`

### 过滤规则 (Filtering Rules)

- **显式排除** — `--exclude` 指定的 Provider 完全不参与评分
- **Intent 过滤** — 完全不匹配 intent 的 Provider 排除
- **成本封顶** — 预估成本超过 `maxCost` 阈值的 Provider 过滤
- **可靠性阈值** — 低于 `minReliability` 的 Provider 过滤
- **版本过滤** — 不满足 `minVersion` 要求的 featureMatch 降级
- **地区匹配** — 精确地区 +15 分，前缀匹配 +10 分

## 示例 (Examples)

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

## 决策可解释 (Decision Explainability)

每次路由结果包含完整的决策记录（RouteResult），可查看以下信息：

- **intent** — 路由目标意图
- **totalCandidates** — 总候选 Provider 数
- **filteredAfterConstraints** — 被过滤的 Provider 数（含排除）
- **strategyWeights** — 使用的权重向量
- **failoverChain** — 降级链（若发生降级）
