# Synapse Router 知识库

> 面向 AI Agent 的受控 Schema 协商与多 Provider 路由层

---

## 项目概览

- **产品**: Synapse Router
- **定位**: 位于 Agent、工具、模型和 Provider API 之间的契约协商与路由层
- **核心使命**: 让 Provider 选择、Schema 兼容性和路由决策可观察、可测试、可替换
- **当前阶段**: 契约基础与协商引擎规划

## 知识库导航

### 产品规划

- [[01-产品规划/synapse-router-product-vision|产品愿景与定位]]
- [[01-产品规划/synapse-router-product-principles|产品原则]]
- [[01-产品规划/synapse-router-roadmap|产品路线图]]
- [[01-产品规划/synapse-router-dual-schema-design|双 Schema 契约设计]] ⭐ 核心设计
- [[01-产品规划/synapse-router-phase1-design|Phase 1 实施设计]] ⭐ 当前执行

### 技术架构

- [[04-技术架构/synapse-router-architecture|系统架构]]
- [[04-技术架构/synapse-router-dsl-spec|DSL 规范]]

---

## 目录结构

| 目录 | 内容 |
|------|------|
| `01-产品规划/` | 产品愿景、原则、路线图 |
| `04-技术架构/` | 系统架构、DSL/契约规范 |

## 维护规则

- 新文档优先归入现有编号目录。
- 面向产品目标、阶段、原则的文档放入 `01-产品规划/`。
- 面向包边界、协议、契约、运行时流程的文档放入 `04-技术架构/`。
- 使用 Obsidian wikilink 维护文档之间的引用。

---

最后更新：2026-04-27
