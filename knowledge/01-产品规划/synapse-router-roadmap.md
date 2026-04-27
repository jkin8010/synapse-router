# 路线图

## 阶段 1：契约基础

- 定义路由契约、Schema、能力、策略和协商结果的核心 TypeScript 类型。
- 添加契约形态校验工具。
- 在契约稳定前，不实现真实执行逻辑。

## 阶段 2：协商引擎

- 实现 Provider 能力匹配。
- 返回 accepted、adapted 或 rejected 协商结果。
- 为不兼容和降级决策添加原因码。

## 阶段 3：Provider Adapter 边界

- 定义最小 Provider Adapter 接口。
- 添加 mock Provider Adapter，保证测试可预测。
- 将真实 Provider SDK 隔离在 `packages/core` 之外。

## 阶段 4：路由策略

- 添加基于能力匹配度、成本、延迟和显式 Provider 偏好的选择规则。
- 输出路由决策元数据，便于调试和审计。

## 阶段 5：Server 与 Playground

- 通过 `apps/server` 暴露契约提交接口。
- 在真实 Provider 调用前，使用 `apps/playground` 测试协商结果。
- 添加展示 Schema 适配路径和拒绝路径的示例。