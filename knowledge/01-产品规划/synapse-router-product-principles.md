# 原则

## 先有契约，再调用

每次路由都从 Schema 契约开始。只有在输入、输出和能力要求明确之后，才允许调用 Provider。

## 协商必须显式

Schema 变化必须可见。如果 Router 对契约进行降级、适配或拒绝，调用方应获得结构化原因，而不是遇到静默 fallback。

## Provider 可替换，但不等价

Provider Adapter 应诚实暴露能力。Router 根据契约匹配度、成本、延迟、可靠性和 Schema 支持情况做选择，而不是假设所有模型 API 行为一致。

## 输出标准化

应用代码应消费 Router 层定义的结果类型。Provider 私有响应结构应被限制在 Provider Adapter 内部。

## Core 最小，边界可扩展

Core 只定义契约、协商结果、路由决策和错误形态。Provider 细节、策略规则和运行时集成应位于 Core 边界之外。

## 路由可观察

每次路由决策都应该可解释：请求的 Schema、选中的 Provider、协商结果和原因码都应可追踪。