# 路线图

## 阶段 1：契约基础 + 纯客户端工具（Phase 1）

**产品形态**：纯客户端工具（形态 2）  
**时间**：Week 1-8

- 定义 AgentSchema / ServerSchema 核心 TypeScript 类型
- Provider Pack 标准结构定义
- 手动创建 3 个预置 Pack（OpenAI / Replicate / Stability）
- API Key Vault 加密存储
- HTTP API Server（首要入口）
- 基于Schema Lock的执行引擎（直连Provider）
- Schema Negotiation（本地小模型 + 云端 LLM fallback）
- Provider Pack Generator（简版）
- MCP Server + CLI（演示/应用入口）
- 开源发布

## 阶段 2：云端 Registry（Phase 2）

**产品形态**：客户端 + 云端（形态 1 增值）  
**时间**：Phase 1 后 3-6 个月

- Synapse Cloud Registry（Provider 发现和发布）
- Pack Generator 升级为云端版（用户提交API文档，云端自动生成Pack）
- 云端 Schema Registry Agent（更智能的协商）
- 变更通知（Webhook + 轮询降级）
- API Key 生命周期管理（过期档次）
- 更多 Provider Pack（ComfyUI、Midjourney API 等）
- Registry 订阅 / Provider Pack 付费

## 阶段 3：Provider Adapter 边界

**产品形态**：客户端 + 云端 + 可选代理  
**时间**：Phase 2 后

- 定义最小 Provider Adapter 接口
- 添加 mock Provider Adapter，保证测试可预测
- 将真实 Provider SDK 隔离在 `packages/core` 之外
- 可选云端代理模式（用户可选托管 API Key）

## 阶段 4：路由策略

- 添加基于能力匹配度、成本、延迟和显式 Provider 偏好的选择规则
- 输出路由决策元数据，便于调试和审计

## 阶段 5：生态建设

- Agent Protocol v0.4 标准化
- 社区贡献 Provider Pack
- 企业私有化部署支持
- Playground 可视化
- Agent 自助管理界面

---

最后更新：2026-04-27
