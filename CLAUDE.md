# Synapse Router

面向 AI Agent 的受控 Schema 协商与多 Provider 路由层。位于 AI Agent 与多 Provider API 之间，确保每次请求在执行前都有明确契约。

> **更新时间**: 2026-05-09
>
> **核心定位**: Router 不是运行时中间件，而是**开发时 SDK 生成引擎**。应用代码里没有 Router，只有生成的 SDK。所有协商、路由决策、Provider 选择在开发时完成，运行时只有纯代码 SDK。

<!-- Language Preferences -->
## Communication

- **交流语言**: 简体中文 — 所有与用户的交流使用简体中文
- **Code Comments**: English — all code comments, docstrings, and inline documentation must be written in English
- **Log Messages**: English — log messages should be in English
- **Variable/Function Names**: English — all identifiers in English

## 技术栈

- **语言**: TypeScript 5.9+ (strict mode)
- **运行时**: Node.js 22+
- **包管理**: pnpm 10+ (monorepo workspace)
- **测试**: Node.js 原生 test runner (`node --experimental-test-coverage`)
- **构建**: `tsc` (每个包独立编译)
- **CLI 发布**: `pnpm link --global`

## 项目结构

```
synapse-router/
├── packages/           # 核心库包（每个包独立编译、独立 npm 发布）
│   ├── core/           # 共享类型定义、Schema 校验、结果/错误形态
│   ├── negotiator/     # Schema 协商引擎（Intent 匹配 + 能力验证）
│   ├── providers/      # Provider Registry + Adapter 接口 + 能力验证
│   ├── router/         # 路由策略（cheap/fast/quality）+ 执行引擎
│   ├── connector/      # 薄连接层：HTTP 调用 + 字段映射 + base_url 覆盖
│   ├── lock/           # Schema Lock：缓存/存储/迁移/过期检测
│   ├── vault/          # API Key 加密存储（AES-256-GCM + OS Keychain）
│   ├── pack-generator/ # 从 OpenAPI Spec 自动生成 Provider Pack
│   ├── sdk-generator/  # 从 Pack DSL 生成 TypeScript / Python SDK
│   ├── sdk/            # SDK 运行时支持
│   ├── billing/        # 用量计费
│   └── observability/  # 可观测性与调试层（Trace/Span/Event）
├── apps/               # 应用入口
│   ├── cli/            # CLI 工具（connect/setup/config/vault/lock/sdk/pack 等）
│   ├── api/            # HTTP API Server（/connect, /negotiate, /providers, /vault）
│   ├── mcp-server/     # MCP Server（Model Context Protocol）
│   ├── playground/     # 本地可视化调试界面
│   └── comfy-node/     # ComfyUI 工作流节点
├── packs/              # 预置 Provider Pack（openai, replicate, stability, comfyui）
├── docs/               # 开发者文档（API.md, PACKS.md）
├── knowledge/          # 知识库（产品规划 + 技术架构）
└── tests/              # E2E 测试
```

## 开发命令

```bash
pnpm install          # 安装依赖
pnpm build            # 构建所有包
pnpm test             # 运行所有测试（280+ tests）
pnpm typecheck        # 类型检查
pnpm dev              # 启动 API Server 开发模式
```

## 架构原则

1. **先有契约，再调用** — 每次路由都从 Schema 契约开始，只有契约明确后才允许调用 Provider
2. **协商必须显式** — Schema 变化必须可见，降级/适配/拒绝需提供结构化原因，不静默 fallback
3. **Provider 可替换，但不等价** — Adapter 诚实暴露能力，Router 根据契约匹配度/成本/延迟做选择
4. **输出标准化** — 应用代码消费 Router 定义的结果类型，Provider 私有响应结构限制在 Adapter 内
5. **Core 最小，边界可扩展** — Core 只定义契约、协商结果、路由决策和错误形态
6. **路由可观察** — 每次路由决策可解释：请求 Schema、选中 Provider、协商结果和原因码可追踪
7. **开发时协商，运行时无感** — 复杂逻辑（Schema 协商、Provider 选择、降级策略）在开发时完成，运行时只有纯代码
8. **无运行时 LLM** — 运行时路径零 Token 成本，不依赖任何 LLM 调用
9. **运行时 = 纯代码 SDK** — 运行时环境无 Router、无 LLM、无随机决策，只有生成的确定性 SDK 代码
10. **产线日志回流开发** — `.synapse/` 日志通过 Git 从产线同步到开发环境，用于反馈驱动优化
11. **Watchdog 独立部署** — synapse watchdog 是独立进程，不嵌入 SDK，保持 SDK 零依赖

## 关键设计约束

- **Connector 是薄连接层**：只做 HTTP 请求 + 字段映射 + base_url 覆盖，不处理业务逻辑
- **Schema Lock 不可变**：一旦锁定不自动随 Pack 更新变化，类似 `package-lock.json`
- **SDK 零依赖**：生成的 SDK 不依赖 `@synapse-router/*`，只使用内置 `fetch`
- **Vault 永不明文落盘**：AES-256-GCM 加密 + 内存解密 + 写回即焚
- **Registry 是可选增强**：Router 在无 Registry 时仍可正常工作
- **API Key 不出现在日志**：所有 Trace/Span 自动 redact

## Pack 结构

每个 Provider Pack 是一个目录：

```
packs/<provider-id>/
├── provider-card.json   # Provider 能力声明（身份 + 服务配置 + 功能列表 + 字段映射）
└── dsl/                 # 每个 Feature 一个 Agent Schema DSL 文件
    ├── chat_post_v1_chat_completions.json
    └── ...
```

Provider Card 由三个顶级对象组成：`provider`（身份）、`service`（服务配置）、`features`（功能声明数组）。详细规范见 `docs/PACKS.md` 和 `knowledge/04-技术架构/synapse-router-dsl-spec.md`。

## 知识库导航

- `knowledge/01-产品规划/` — 产品愿景、原则、路线图、Phase 设计、双 Schema 契约设计
- `knowledge/04-技术架构/` — 系统架构、DSL 规范、可观测性、Registry 集成
- `docs/` — API 参考、Pack 开发指南

## 编码约定

- 使用 TypeScript strict mode，所有包独立 `tsconfig.json`
- 包命名遵循 `@synapse-router/<name>` 模式
- 测试文件与源文件同目录，命名为 `*.test.ts`
- 公共 API 通过各包的 `src/index.ts` 导出
- 错误处理：使用结构化错误类型，不吞异常
- 日志：通过 `@synapse-router/observability` 的 Tracer 注入点，不使用 `console.log`
- 提交信息使用中文，格式：`<type>: <description>`

## Sub-Agent 调度

本项目使用 `AGENTS.md` 中定义的专用 sub-agent 来完成复杂任务。在开始非平凡任务前，检查 `AGENTS.md` 中是否有匹配的 agent，并通过 `Agent` 工具以 `subagent_type=general-purpose` 调度。常用 agent：

- **Synapse Core Developer** — core/negotiator/router 相关改动
- **Provider Pack Developer** — Pack 创建/维护、DSL 编写、pack-generator
- **CLI Developer** — CLI 命令、交互式模式、参数解析
- **API Developer** — HTTP API Server、路由、中间件
- **SDK Generator Developer** — SDK 生成 pipeline、多语言模板
- **Test Engineer** — 测试编写、E2E 测试、覆盖率
