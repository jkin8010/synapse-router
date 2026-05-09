# Synapse Router

**面向 AI Agent 开发者的 Schema 协商与 SDK 生成引擎**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

> **Router 不是运行时中间件**。它是**开发时工具** —— 读取 Provider Pack + 产线日志，生成纯代码 SDK。应用代码里没有 Router，只有生成的 SDK。

---

## 核心流程

```
Registry (Provider API Pack)     .synapse/ (产线运行时日志)
        │                               │
        └──────────┬────────────────────┘
                   │ 开发时
                   ▼
         synapse evolve
      (可含 LLM，一次性，离线)
                   │
                   ▼
        纯代码 SDK (TypeScript/Python)
        零运行时依赖 · 无 LLM · 无随机
                   │
                   ▼
        应用集成 → 自测 → 提交生产
                   │
                   ▼
        SDK 运行时写入 .synapse/ 日志
                   │
                   ▼
        synapse watchdog (独立进程)
        正常→无操作 · 致命错误→自动 Git Issue
                   │
                   └──→ 下一轮迭代
```

## 三个层次

| 层次 | 是什么 | 含 LLM? | 何时运行 | 复杂度 |
|------|--------|---------|---------|--------|
| **运行时** | 生成的 SDK（纯代码） | ❌ 无 | 每次 API 调用 | 极薄 |
| **演化** | `synapse evolve` | ✅ 可含 | 开发时，一次性 | 复杂 |
| **监控** | `synapse watchdog` | ❌ 无 | 后台常驻/CI | 可配置 |

## 快速开始

### 安装

```bash
git clone https://github.com/useeclaw/synapse-router.git
cd synapse-router && pnpm install && pnpm build
cd apps/cli && pnpm link --global
```

### 配置 Provider

```bash
# 交互式首次配置
synapse setup

# 存储 API Key
synapse vault set openai sk-xxx
synapse vault set deepseek sk-xxx --base-url https://api.deepseek.com/v1
```

### 生成 SDK（核心路径）

```bash
synapse evolve --out-dir ./sdk

# 你的应用代码现在可以 import 生成的 SDK
```

### 开发调试

```bash
synapse connect openai chat --input '{"messages":[{"role":"user","content":"Hello"}]}'
```

### 产线运维

```bash
# 运行时日志自动写入 .synapse/，通过 Git 同步到开发环境
synapse export --stdout | ssh dev "synapse import --stdin"
synapse watchdog --daemon       # 监控异常，自动创建 Issue
```

## 架构

```ascii
synapse-router/
├── packages/
│   ├── core/              # Schema 类型定义 + 校验 + 规范化
│   ├── negotiator/        # Schema 协商引擎（Intent 匹配 + 能力验证）
│   ├── providers/         # Provider Registry + Adapter 接口
│   ├── router/            # 路由策略 + evolve 演化引擎
│   ├── connector/         # HTTP 连接层（字段映射 + base_url 覆盖）
│   ├── lock/              # Schema Lock（缓存/存储/迁移）
│   ├── vault/             # API Key 加密存储
│   ├── pack-generator/    # 从 OpenAPI Spec 生成 Provider Pack
│   ├── sdk-generator/     # 从 Pack DSL 生成 TypeScript / Python SDK
│   ├── sdk/               # SDK 运行时支持（含 Logger）
│   ├── billing/           # 用量计费
│   └── observability/     # 可观测性
├── apps/
│   ├── cli/               # CLI 工具
│   ├── api/               # HTTP API Server
│   ├── mcp-server/        # MCP Server
│   └── playground/        # 可视化调试界面
├── packs/                 # 预置 Provider Pack
└── tests/                 # E2E 测试
```

## 关键设计原则

1. **开发时协商，运行时无感** — 复杂逻辑在开发时完成，运行时只有纯代码
2. **无运行时 LLM** — 运行时路径零 Token 成本、零 LLM 意外
3. **确定性路由** — 相同的 SDK 输入永远产生相同的 Provider 选择
4. **薄运行时** — SDK 只做 HTTP 调用 + 一行日志写入，不包含判断逻辑
5. **日志即反馈** — `.synapse/` 通过 Git 同步，watchdog 监控异常

## 与 Synapse Registry 的关系

```
Registry                          Router
────────                          ──────

提供 Provider Pack             开发时读取 Pack → 协商 → 生成 SDK
检测 Provider API 变化         产生运行时日志写入 .synapse/
提供 Intelligence 统计数据      evolve 时拉取作为参考
```

## 状态

| 里程碑 | Phase | 状态 |
|--------|-------|------|
| v1.0 Negotiator Reliability | Phase 1 | ✅ Shipped |
| v1.1 Testing & Playground | Phases 2-4 | 🔄 In progress |
| v1.2 Router as SDK Generator | Phase 5 | 📋 Planned |
| v2.0 Offline Evolution | Phases 6-7 | 📋 Planned |

## 开发

```bash
pnpm install
pnpm build
pnpm test          # 280+ tests
pnpm typecheck
```

## License

Apache License 2.0
