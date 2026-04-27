# Synapse Router 知识库维护说明

> Synapse Router 项目文档区，按参考项目的编号目录方式组织。

## 项目概览

- **产品**: Synapse Router
- **定位**: 面向 AI Agent 的受控 Schema 协商与多 Provider 路由层
- **关键边界**: Router 负责契约校验、Provider 能力协商、策略选择和标准化结果；不承担业务工作流编排。

## 目录结构

| 目录 | 内容 |
|------|------|
| `01-产品规划/` | 愿景、原则、路线图、产品阶段规划 |
| `04-技术架构/` | 包边界、请求流程、DSL 规范、Provider Adapter 边界 |

## 文档归类规则

- 产品定位、用户目标、非目标、开发原则、阶段规划：放入 `01-产品规划/`。
- TypeScript 类型契约、系统模块、请求流程、Provider 能力、策略规则：放入 `04-技术架构/`。
- 未来如果出现竞品调研，可新增 `02-竞品分析/`。
- 未来如果出现 UI 或 Playground 交互设计，可新增 `05-UIUX设计/`。
- 废弃或过期方案统一放入 `98-归档/`，并在 `README.md` 中标注替代文档。

## 链接规则

- 使用 Obsidian wikilink：`[[目录/文件名|展示名称]]`。
- 文件名使用项目名前缀和英文 kebab-case，便于跨项目搜索。
- 中文标题保留在文档正文的一级标题中。

## 当前权威文档

- [[01-产品规划/synapse-router-product-vision|产品愿景与定位]]
- [[01-产品规划/synapse-router-product-principles|产品原则]]
- [[01-产品规划/synapse-router-roadmap|产品路线图]]
- [[04-技术架构/synapse-router-architecture|系统架构]]
- [[04-技术架构/synapse-router-dsl-spec|DSL 规范]]
