# 架构

Synapse Router 拆分为多个小包，让 Schema 契约、协商、Provider Adapter 和路由策略可以独立演进。

## Packages

- `packages/core`：共享契约类型、结果类型和错误形态。
- `packages/negotiator`：Schema 兼容性检查与契约适配。
- `packages/providers`：Provider Adapter 接口和 Provider 能力元数据。
- `packages/router`：路由选择、策略评估和执行交接。

## Apps

- `apps/server`：提交路由契约并接收标准化结果的 HTTP 边界。
- `apps/comfy-node`：用于 Comfy 相关集成工作的外部 submodule。
- `apps/playground`：用于测试契约和 Provider 行为的本地开发界面。

## 请求流程

1. 调用方提交路由契约。
2. Router 校验契约形态。
3. Negotiator 将契约与 Provider 能力进行比较。
4. Router 应用策略约束。
5. 被选中的 Provider Adapter 执行标准化请求。
6. Router 返回标准化结果和路由元数据。

## 边界规则

Provider Adapter 可以翻译 Provider 私有请求与响应格式。Core 契约不能导入任何 Provider SDK 类型。