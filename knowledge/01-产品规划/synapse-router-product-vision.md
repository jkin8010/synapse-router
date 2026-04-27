# 愿景

Synapse Router 是面向 AI Agent 的受控 Schema 协商与多 Provider 路由层。

它不是另一个 Agent 框架。它位于 Agent、工具、模型和 Provider API 之间，确保每次请求在执行前都有明确契约。

## 开发者目标

开发者应该能够：

- 声明一次 AI 操作需要的输入与输出形态。
- 在不同 Provider 能力之间协商最接近的可支持 Schema。
- 将执行路由到最适合该契约的 Provider。
- 获得可被下游代码信任的标准化、类型化输出。

## 非目标

- 不做隐藏的 prompt 编排。
- 不让 Provider 私有行为泄漏到业务代码。
- 不在路由层实现业务工作流逻辑。

Router 应让 Provider 选择和 Schema 兼容性变得可观察、可测试、可替换。