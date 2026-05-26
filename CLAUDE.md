# Synapse Router

面向 AI Agent 的受控 Schema 协商与多 Provider 路由层。位于 AI Agent 与多 Provider API 之间，确保每次请求在执行前都有明确契约。

> **更新时间**: 2026-05-19
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

## Synapse CLI

Synapse CLI 是 Router 的开发者工具入口。所有协商、路由、账单管理都在 CLI 中完成。

命令分为三组：

- **核心工作流 (Core Workflow):** setup（初始化）、negotiate（Schema 协商）、connect（连接 Provider 执行功能）
- **配置 (Configuration):** vault（API Key 管理）、config（配置管理）、pack（Pack 管理）、billing（计费管理）
- **高级 (Advanced):** `synapse --help` 查看完整列表（lock、route、sdk、watchdog、provider——`init`/`smoke`/`profile`/`export`/`import` 已合并到 `config`/`connect`/`setup`）

### connect — 连接 Provider 执行功能

连接指定 Provider 并执行一个功能（intent）。

```bash
synapse connect <provider> <intent> [--input <json>] [--billing <strategy>]
```

**参数：**
- `<provider>` — Provider ID（如 `deepseek`, `openai`）
- `<intent>` — 意图类型（如 `chat`, `text-to-image`）
- `--input <json>` — 输入参数的 JSON 字符串
- `--billing <strategy>` — 计费策略（如 `preCall`），如果 billing 配置存在则自动包裹
- `--smoke` — 运行 Provider smoke 测试（替代独立 `smoke` 命令）

**示例：**
```bash
# 连接到 DeepSeek 执行 chat 意图
synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"hello"}]}'

# 使用 billing 包裹
synapse connect deepseek chat --input '{"messages":[]}' --billing preCall

# 运行 smoke 测试
synapse connect --smoke --provider openai
```

> **相关命令：** `synapse billing init`（初始化计费配置）、`synapse vault set`（预存 API Key）、`synapse setup`（交互式初始化）

### setup — 交互式初始化向导（替代 init）

```bash
synapse setup
```

首次运行的交互式设置，引导用户选择 Provider、配置 API Key 和基础参数。替代了 `synapse init` 命令。

### config — 配置管理

```bash
synapse config set|get|list [key] [value]
```

**子命令：**
- `set` — 设置配置值，支持点号记法（如 `billing.*`）
- `get` — 获取配置值
- `list` — 列出所有配置
- `profile` — 管理 Provider Profiles（替代独立 `profile` 命令）
- `export` — 导出 `.synapse/` 数据（替代独立 `export` 命令）
- `import` — 导入 `.synapse/` 数据（替代独立 `import` 命令）

**示例：**
```bash
synapse config set billing.strategy perToken
synapse config get billing.strategy
synapse config list
synapse config profile list
synapse config export --output ./backup.tgz
synapse config import ./backup.tgz --merge
```

### billing — 账单管理与配额查看

```bash
synapse billing init|config|status [options]
```

**子命令：**
- `init [--strategy <s>] [--limit <n>] [--provider <id>]` — 交互式初始化向导
- `config [set|get]` — 查看或修改计费配置
- `status [--format json|table]` — 查看配额状态和预估费用

**示例：**
```bash
# 交互式初始化计费
synapse billing init

# 指定策略和限额
synapse billing init --strategy perToken --limit 10 --provider deepseek

# 查看配额状态（表格格式）
synapse billing status

# 机器可读输出
synapse billing status --format json
```

### route — 多维评分路由

```bash
synapse route <intent> [--strategy <strategy>] [--exclude <providers>] [--region <region>] [--min-version <version>]
```

**参数：**
- `<intent>` — 意图类型（如 `chat`, `text-to-image`）
- `--strategy <s>` — 路由策略：`cheap` / `fast` / `quality` / `balanced`（默认）/ `cost-capped`
- `--exclude <ids>` — 排除的 Provider 列表
- `--region <region>` — 偏好地区（如 `us-east`, `eu-west`, `apac`）
- `--min-version <v>` — 最低模型版本（如 `3.5`, `4.0`）

**示例：**
```bash
# 使用质量优先策略路由 chat 意图
synapse route chat --strategy quality

# 排除指定 Provider 并限定地区
synapse route chat --exclude openai --region apac --min-version 3.5
```

### sdk — 从 Provider Pack 生成 SDK

`synapse sdk generate` 是 SDK 生成的唯一命令。它从单个 Provider Pack 生成零依赖 SDK 代码。

```bash
synapse sdk generate --pack <pack> --lang <lang> --output <dir> [options]
```

**参数：**
- `--pack <id>` — Pack ID 或路径（如 `openai`、`./packs/openai`）
- `--lang <lang>` — 目标语言：`typescript` | `python`
- `--output <dir>` — 输出目录
- `--provider <id>` — 覆盖 Provider 名称（如用 openai Pack 生成 deepseek SDK）
- `--base-url <url>` — 覆盖默认 base_url

**示例：**
```bash
# 生成 TypeScript SDK
synapse sdk generate --pack openai --lang typescript --output ./sdk

# 生成 Python SDK
synapse sdk generate --pack openai --lang python --output ./sdk

# 使用 openai Pack 生成 DeepSeek SDK（覆盖 provider 和 base_url）
synapse sdk generate --pack openai --lang typescript --provider deepseek --base-url https://api.deepseek.com/v1 --output ./sdk
```

> `sdk generate` 是低层原语——一个 Pack、一种语言、一次输出。`synapse evolve` 是其高阶封装，自动处理所有 Pack 的批量生成。

### pack — 从 Registry 管理 Provider Pack

```bash
synapse pack add|search|list|update|remove|show [options]
```

**子命令：**
- `add <pack-id>` — 从 Registry 安装 Pack
- `search <query>` — 在 Registry 中搜索 Pack
- `list [--remote]` — 列出本地或远程 Pack
- `update <pack-id>` — 更新已安装的 Pack
- `remove <pack-id>` — 移除已安装的 Pack
- `show <pack-id>` — 显示 Pack 详情

**示例：**
```bash
# 搜索 Provider Pack
synapse pack search deepseek

# 安装 Pack
synapse pack add deepseek-v3

# 列出本地已安装 Pack
synapse pack list
```

### vault — 管理加密 API Key

```bash
synapse vault set|list|get|remove|verify|rotate
```

**子命令：**
- `set <provider> <key> [--base-url <url>] [--pack <id>]` — 存储加密 API Key（AES-256-GCM）
- `list` — 列出已存储的 Provider（值隐藏）
- `get <provider>` — 读取指定 Provider 的 Key
- `remove <provider>` — 删除指定 Key
- `verify <provider>` — 验证 Key 格式
- `rotate <provider>` — 交互式密钥轮换

**示例：**
```bash
# 存储 API Key 并配置 base_url
synapse vault set deepseek sk-xxx --base-url https://api.deepseek.com/v1

# 列出所有已存储 Key
synapse vault list

# 验证 Key 格式
synapse vault verify deepseek
```

### lock — 管理 Schema Lock

```bash
synapse lock list|show|remove|migrate|outdated
```

**子命令：**
- `list` — 列出所有 Schema Lock
- `show <lock-id>` — 显示 Lock 详情
- `remove <lock-id>` — 删除 Lock
- `migrate <lock-id> <new-pack-version>` — 迁移 Lock 到新 Pack 版本
- `outdated` — 检测过期 Lock

**示例：**
```bash
# 列出已有 Schema Lock
synapse lock list

# 检测过期 Lock
synapse lock outdated
```

## Schema 协商与 SDK 生成

Synapse Router 的 Schema 协商管道是连接 Agent 需求与 Provider 能力的核心机制。

### 1. Provider Pack Schema

每个 Provider 通过 Pack 声明其能力。Pack 结构定义在 `packs/<provider-id>/` 目录：

```
packs/<provider-id>/
├── provider-card.json   # 身份 + 服务配置 + 功能声明 + 定价 + 限速
└── dsl/                 # 每个 Feature 一个 Agent Schema DSL 文件
    ├── chat_post_v1_chat_completions.json
    └── ...
```

**provider-card.json** 由三个顶级对象组成：

- `provider` — 身份标识：`id`, `name`, `docs_url`, `auth_type`
- `service` — 服务配置：`id`, `version`, `api_version`, `base_url`, `auth_type`
- `features` — 功能声明数组：每个 feature 包含 `id`, `intent`, `name`, `input`/`output` 字段定义、`field_mappings`、`pricing`, `limits`

**DSL 文件** 包含该 Feature 的 Agent Schema，定义输入输出字段类型和约束。协商引擎读取 DSL 文件与 Agent 的 Schema 进行匹配。

Provider Card 详细规范见 `docs/PACKS.md` 和 `knowledge/04-技术架构/synapse-router-dsl-spec.md`。

### 2. Intent 匹配

协商引擎（`@synapse-router/negotiator`）将 Agent 的意图意图匹配到 Provider 的 Feature：

```
Agent Intent (如 "chat") → Negotiate → Provider Feature (如 "chat_post_v1_chat_completions")
```

**匹配结果三元组：**

| 结果 | 含义 |
|------|------|
| `accepted` | Intent 完全匹配，Schema 兼容 |
| `adapted` | 存在字段差异（missing、extra、type_mismatch），但可以通过 field_mappings 适配 |
| `rejected` | 不兼容的 Schema 或缺少必要能力 |

匹配过程包含字段级 Manifest 约束检查：`required`、`type`、`enum`、`minLength`、`maxLength`。差异被结构化记录为 `ManifestMatchResult`：

- `missing` — Agent 缺少的必需字段
- `extra` — Agent 多出的未声明字段
- `type_mismatch` — 字段类型不匹配列表

### 3. SDK 生成流程

`synapse sdk generate` 是 SDK 生成的唯一命令，其处理流程：

1. **读取 Provider Pack** — 加载 Provider Pack
2. **生成代码** — 根据 Pack DSL 中的字段映射生成 TypeScript / Python SDK 代码
3. **输出** — 写入 `--output` 目录，零外部依赖

```bash
# 生成 TypeScript SDK
synapse sdk generate --pack openai --lang typescript --output ./sdk
```

SDK 生成器（`@synapse-router/sdk-generator`）将 Pack DSL 转换为纯函数代码，使用内置 `fetch`，不依赖 `@synapse-router/*`。

`--with-billing` 标志会在生成的 SDK 中包含 `BillingTracker` 类，自动追踪每次调用并记录用量。

### 4. Schema Lock

Schema Lock 类似 `package-lock.json`，是对 Schema 契约的冻结：

- **不可变** — 一旦锁定不会自动随 Pack 更新变化
- **确定性** — 相同输入得到相同输出，消除运行时意外
- **过期检测** — `synapse lock outdated` 检测 Pack 版本变化后需要重新协商的 Lock
- **迁移** — `synapse lock migrate` 将现有 Lock 迁移到新 Pack 版本

## Provider 路由

多维评分路由引擎（`@synapse-router/router`）根据策略对候选 Provider 进行评分、过滤、排序，选择最优 Provider。路由是纯函数，相同输入始终得到相同输出。

### 路由策略

系统提供 5 种内置策略：

| 策略 ID | 名称 | 权重分布（cost/latency/reliability/featureMatch/preference） | 适用场景 |
|---------|------|------------------------------------------------------------|---------|
| `cheap` | 成本优先 | 5 / 1 / 1 / 1 / 0.5 | 成本敏感型场景 |
| `fast` | 速度优先 | 1 / 5 / 1 / 1 / 0.5 | 实时交互场景 |
| `quality` | 质量优先 | 0.25 / 0.25 / 6 / 4 / 0.5 | 质量关键型场景 |
| `balanced` | 均衡策略（默认） | 1 / 1 / 1 / 1 / 0.5 | 通用场景 |
| `cost-capped` | 预算封顶 | 3 / 1 / 2 / 2 / 0.5 (+ maxCost 过滤 0.01) | 有预算约束的场景 |

也支持**自定义策略**，通过 `synapse config set route.strategies.xxx` 注册。

### 评分维度

每个候选 Provider 在 5 个维度上评分（归一化到 [0, 100]）：

| 维度 | 含义 | 评分依据 |
|------|------|---------|
| `cost` | 成本 | Feature 级别成本系数 + 输入规模预估 |
| `latency` | 延迟 | Provider 延迟等级（cheap/fast/quality）+ 地区匹配加分 |
| `reliability` | 可靠性 | Provider 可靠性系数 0~1 |
| `featureMatch` | 功能匹配 | Intent 精确/模糊匹配 + 地区前缀 + 版本过滤 |
| `preference` | 偏好 | 用户指定的 preferredProviders 提权 |

加权总分公式：`totalScore = Σ(dimensionScore × weight)`。

**过滤规则：**
- 显式排除（`--exclude`）：Provider 完全不参与评分
- Intent 过滤：完全不匹配 intent 的 Provider 排除
- 成本封顶（`maxCost`）：预估成本超过阈值则过滤
- 可靠性阈值（`minReliability`）：低于阈值的 Provider 过滤
- 版本过滤（`minVersion`）：不满足版本要求的 featureMatch 降级
- 地区匹配：精确地区 +15，前缀匹配 +10

### synapse route 命令

```bash
synapse route <intent> [--strategy <strategy>] [--exclude <providers>] [--region <region>] [--min-version <version>]
```

**示例：**
```bash
# 均衡策略路由
synapse route chat

# 质量优先，排除特定 Provider
synapse route chat --strategy quality --exclude openai

# 指定地区和最低版本
synapse route chat --region apac --min-version 3.5
```

### 决策可解释

每次路由结果包含完整决策记录（`RouteResult.explanation`）：

- `intent` — 路由目标意图
- `totalCandidates` — 总候选 Provider 数
- `filteredAfterConstraints` — 被过滤的 Provider 数（含排除）
- `strategyWeights` — 使用的权重向量
- `failoverChain` — 降级链（若发生降级）

### 运行时无路由

路由决策在开发时通过 `synapse sdk generate` 完成，运行时路径不包含路由引擎。生成的 SDK 直接调用选定的 Provider，零决策开销。

## Billing 集成

Billing 模块（`@synapse-router/billing`）为 Provider 调用提供用量计费和配额管理能力。

### 初始化

```bash
synapse billing init [--strategy <s>] [--limit <n>] [--provider <id>]
```

交互式向导引导用户完成：
1. 选择 Pricing 策略
2. 设置配额限制（USD）
3. 选择目标 Provider
4. 配置降级策略

**示例：**
```bash
# 交互式初始化
synapse billing init

# 非交互式（指定参数）
synapse billing init --strategy perToken --limit 10 --provider deepseek
```

### 配置管理

```bash
synapse billing config [subcommand]
```

通过 `synapse config set billing.*` 点号记法访问 billing-config.json：
```bash
synapse config set billing.strategy perToken
synapse config set billing.limit 50
synapse config set billing.provider deepseek
synapse config get billing.strategy
```

### 状态查询

```bash
synapse billing status [--format json|table]
```

显示每个 Provider 的配额使用概览：

```
Provider    Cost/1k tokens    Quota Used    Limit    Reset
deepseek    $0.014 / $0.028   $2.50         $10.00  2026-06-01
openai      $0.150 / $0.600   $5.80         $50.00  2026-06-01
```

支持 `--format json` 输出机器可读格式。

### 配额管理

配额持久化使用 **FileQuotaStorage**，存储在 `~/.synapse/quotas/`：

- 原子写入（`.tmp` + `rename` 模式，防止并发损坏）
- 支持配额类型：`tokens`（Token 数）、`requests`（请求次数）、`cost`（费用金额）
- 支持时间周期：`minute`、`hour`、`day`、`month`、`oneTime`
- 阈值告警：到达 `threshold`（如 80%）时触发 warn

### 定价策略

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| `flat` | 按次固定费率 | 固定价格 API |
| `perToken` | 按 Token 计费（input/output 分开） | LLM API（如 OpenAI, DeepSeek） |
| `perUnit` | 按单位计费 | 图片生成 API |
| `tiered` | 阶梯定价（用量越大单价越低） | 批量调用 |

定价规则从 Provider Card 的 `features[].pricing` 字段提取，通过 `pricingFromProviderCard` 纯函数桥接。

### 自动包裹

当 billing 配置存在时，`synapse connect` 自动包裹 Connector：

```
synapse connect deepseek chat --input '{...}'  →  createBillingConnector(connector)
                                                       ↓
                                              preCall (check quota)
                                              execute API call
                                              postCall (consume quota)
```

Billing 错误默认不阻塞 API 调用。

### 降级策略

| 策略 | 行为 |
|------|------|
| `warn`（默认） | 记录告警但不阻止调用 |
| `reject` | 超出配额时拒绝调用 |
| `downgrade` | 自动降级到低价 Provider |
| `notify` | 发送通知并继续执行 |

> **相关命令：** `synapse billing status`（查看配额）、`synapse sdk generate --with-billing`（生成含 BillingTracker 的 SDK）

## Sub-Agent 调度

本项目使用 `AGENTS.md` 中定义的专用 sub-agent 来完成复杂任务。在开始非平凡任务前，检查 `AGENTS.md` 中是否有匹配的 agent，并通过 `Agent` 工具以 `subagent_type=general-purpose` 调度。常用 agent：

- **Synapse Core Developer** — core/negotiator/router 相关改动
- **Provider Pack Developer** — Pack 创建/维护、DSL 编写、pack-generator
- **CLI Developer** — CLI 命令、交互式模式、参数解析
- **API Developer** — HTTP API Server、路由、中间件
- **SDK Generator Developer** — SDK 生成 pipeline、多语言模板
- **Test Engineer** — 测试编写、E2E 测试、覆盖率
