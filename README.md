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
         synapse sdk generate
      (可含 LLM，一次性，离线)
         ├── 协商 Schema 契约
         ├── 多维度路由评分
         ├── 生成纯代码 SDK
         └── 策略权重调优
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
| **演化** | `synapse sdk generate` | ❌ 无 | 开发时，一次性 | 中 |
| **监控** | `synapse watchdog` | ❌ 无 | 后台常驻/CI | 可配置 |

## 路由引擎

多维度评分路由引擎，为给定 intent 选择最优 Provider。5 种预置策略 + 自定义策略：

| 策略 | 用途 | 权重重点 |
|------|------|---------|
| `cheap` | 成本优先 | 成本 5x |
| `fast` | 速度优先 | 延迟 5x |
| `quality` | 质量优先 | 可靠性 6x + 功能匹配 4x |
| `balanced` | 均衡（默认） | 均等权重 |
| `cost-capped` | 预算封顶 | 成本 3x + 质量 2x |

每个 Provider 在 5 个维度上独立评分（0-100），然后加权汇总：

- **cost**: 对数曲线，$0.001→100, $1→40, $10→20
- **latency**: 类别 (fast/cheap/quality) + ms 精度调整
- **reliability**: 4 次方曲线，0.99→96, 0.95→81, 0.9→66
- **featureMatch**: 精确匹配 100, 模糊 70, 不匹配→排除
- **preference**: 用户偏好 Provider +30 分

并支持高级过滤：`excludeProviders`、`region`（地区匹配加分）、`minVersion`（最低模型版本）。

### 自定义策略

```bash
# 持久化自定义策略到 config
synapse config set route.strategies.myCustom.weights.cost 3
synapse config set route.strategies.myCustom.weights.reliability 2

# 使用自定义策略
synapse route chat --strategy myCustom

# 或一次性权重覆盖
synapse route chat --strategy-weights '{"cost":5,"latency":1}'
```

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

### 路由 — 选择最优 Provider

```bash
# 默认均衡策略
synapse route chat

# 速度优先
synapse route chat --strategy fast --format table

# 预算控制 + 排除
synapse route text-to-image --strategy cheap --max-cost 0.01 --exclude replicate --format table

# 地区偏好 + 版本过滤
synapse route chat --region us-east --min-version 4.0
```

### 生成 SDK（核心路径）

```bash
# 基础生成
synapse sdk generate --pack openai --lang typescript --output ./sdk

# 包含产线数据
synapse config profile refresh   # 从日志聚合产线数据
synapse sdk generate --pack openai --lang typescript --output ./sdk
```

### 开发调试

```bash
synapse connect openai chat --input '{"messages":[{"role":"user","content":"Hello"}]}'
```

### 产线运维

```bash
# 运行时日志自动写入 .synapse/，通过 Git 同步到开发环境
synapse config export --stdout | ssh dev "synapse config import --stdin"
synapse watchdog --daemon       # 监控异常，自动创建 Issue
```

### 所有 CLI 命令

```
  setup [--sdk]                 交互式首次配置向导 / SDK 项目脚手架
  connect <provider> <intent>   连接到 Provider 并执行功能（--smoke 运行冒烟测试）
  negotiate <schema-file>       运行 Schema 协商
  vault set|list|get|remove     管理 API Key
  config set|get|list           配置管理
  config profile|export|import  产线 Profile / 数据导出导入
  pack add|search|list|update   从 Registry 管理 Pack
  billing init|config|status    计费与配额管理
  lock list|show|remove|migrate Schema Lock 管理
  route <intent>                路由到最优 Provider
  sdk generate                  从 Pack 生成 SDK
  provider list|show            Provider Pack 管理
  watchdog                      监控异常自动创建 Issue
```

> 已下线：`generate`、`evolve`、`init`、`smoke`、`profile`、`export`、`import`、`execute`。
> 其中 `smoke` / `init` / `profile` / `export` / `import` 仍作为别名保留并提示新入口。

## 架构

```ascii
synapse-router/
├── packages/
│   ├── core/              # Schema 类型定义 + 校验 + 规范化 (86 tests)
│   ├── negotiator/        # Schema 协商引擎（Intent 匹配 + 能力验证）(42 tests)
│   ├── providers/         # Provider Registry + Adapter 接口
│   ├── router/            # 多维度评分路由引擎 (55 tests)
│   ├── connector/         # HTTP 连接层（字段映射 + base_url 覆盖）(26 tests)
│   ├── lock/              # Schema Lock（缓存/存储/迁移）(19 tests)
│   ├── vault/             # API Key 加密存储 (77 tests)
│   ├── pack-generator/    # 从 OpenAPI Spec 生成 Provider Pack (23 tests)
│   ├── sdk-generator/     # 从 Pack DSL 生成 TypeScript / Python SDK (24 tests)
│   ├── sdk/               # SDK 运行时支持（含 Logger）(6 tests)
│   ├── billing/           # 用量计费 (92 tests)
│   └── observability/     # 可观测性 (73 tests)
├── apps/
│   ├── cli/               # CLI 工具 (14 个命令, 21 tests)
│   ├── api/               # HTTP API Server
│   ├── mcp-server/        # MCP Server
│   └── playground/        # 可视化调试界面
├── packs/                 # 预置 Provider Pack
└── tests/                 # E2E 测试 (5 个测试文件)
```

## 关键设计原则

1. **开发时协商，运行时无感** — 复杂逻辑在开发时完成，运行时只有纯代码
2. **无运行时 LLM** — 运行时路径零 Token 成本、零 LLM 意外
3. **确定性路由** — 相同的 SDK 输入永远产生相同的 Provider 选择
4. **薄运行时** — SDK 只做 HTTP 调用 + 一行日志写入，不包含判断逻辑
5. **日志即反馈** — `.synapse/` 通过 Git 同步，watchdog 监控异常
6. **策略可调优** — 用产线数据自动调优策略权重

## 与 Synapse Registry 的关系

```
Registry                          Router
────────                          ──────

提供 Provider Pack             开发时读取 Pack → 协商 → 生成 SDK
检测 Provider API 变化         产生运行时日志写入 .synapse/
提供 Intelligence 统计数据     生成 SDK 时拉取作为参考
                                策略权重调优输出到 strategies.json
```

## 状态

| 里程碑 | Phase | 状态 | 完成日 |
|--------|-------|------|--------|
| v1.0 Negotiator Reliability | 1. 协商可靠性 | ✅ Complete | 2026-05-07 |
| v1.1 Testing & Playground | 2. E2E 测试 | ✅ Complete | 2026-05-08 |
| v1.1 Testing & Playground | 3. 可视化调试 | ✅ Complete | 2026-05-09 |
| v1.1 Testing & Playground | 4. Provider 冒烟测试 | ✅ Complete | 2026-05-09 |
| v1.2 Router Integration | 5. Router SDK 生成 | ✅ Complete | 2026-05-09 |
| v2.0 离线演化 | 6. 本地演化引擎 | ✅ Complete | 2026-05-09 |
| v2.0 离线演化 | 7. Registry 协作 | ✅ Complete | 2026-05-09 |

**最新**: `packages/router` 从 45 行存根重写为 1,400+ 行多维度评分路由引擎。55 tests all pass。

## 测试

```bash
pnpm install
pnpm build
pnpm test          # 550+ tests (14 个包)
pnpm typecheck
```

| 包 | 测试数 | 状态 |
|----|--------|------|
| core | 86 | ✅ |
| negotiator | 42 | ✅ |
| router | 55 | ✅ |
| connector | 26 | ✅ |
| lock | 19 | ✅ |
| vault | 77 | ✅ |
| providers | 9 | ✅ |
| billing | 92 | ✅ |
| observability | 73 | ✅ |
| sdk-generator | 24 | ✅ |
| pack-generator | 23 | ✅ |
| registry-client | 4 | ✅ |
| sdk | 6 | ✅ |
| contract-mocker | 18 | ✅ |
| cli | 21 | ✅ |
| **总计** | **~575** | ✅ |

## License

Apache License 2.0
