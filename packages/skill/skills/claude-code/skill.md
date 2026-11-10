# Synapse Router — Claude Code Skill

面向 AI Agent 的受控 Schema 协商与多 Provider 路由层。位于 AI Agent 与多 Provider API 之间，确保每次请求在执行前都有明确契约。这是 Claude Code Skill 文件，通过 Skill 子命令加载，提供 CLI 补全、架构上下文和编码指导。

核心哲学：**"开发时协商，运行时无感"** — 所有协商、路由决策、Provider 选择在开发时完成，运行时只有纯代码 SDK，零 Token 成本、零 LLM 意外。

## 项目概述

Synapse Router 是一个**开发时 SDK 生成引擎**，不是运行时中间件。应用代码里没有 Router，只有生成的 SDK。工作流程分为三个阶段：

1. **协商**：读取 Registry Provider Pack + `.synapse/` 运行时数据，生成 Schema 契约
2. **生成**：输出纯代码的 SDK（TypeScript / Python），零运行时依赖
3. **演化**：基于产线日志 + Provider API 变化，在下一轮迭代中自适应更新 SDK

项目当前处于 v3.0（AI Agent Skill Distribution），已发布 v2.1（Billing 完整支持）。包含 14 个包、4 个应用、~430 个测试用例。

## 技术栈与约定

- **语言**：TypeScript 5.9+ (strict mode)
- **运行时**：Node.js 22+
- **包管理**：pnpm 10+ (monorepo workspace)
- **测试**：Node.js 原生 test runner (`node --experimental-test-coverage`)
- **构建**：`tsc`（每个包独立编译）
- **CLI 发布**：`pnpm link --global`
- **交流语言**：简体中文（用户交互）
- **代码注释**：English（代码注释、文档字符串、日志）
- **标识符**：English（变量、函数、类型名称）
- **提交消息**：中文，格式：`<type>: <description>`

## Synapse CLI 完整参考

Synapse CLI 是 Router 的开发者工具入口。所有协商、路由、账单管理都在 CLI 中完成。

### connect — 连接 Provider 执行功能

```bash
synapse connect <provider> <intent> [--input <json>] [--billing <strategy>]
```

**参数：**
- `<provider>` — Provider ID（如 `deepseek`, `openai`）
- `<intent>` — 意图类型（如 `chat`, `text-to-image`）
- `--input <json>` — 输入参数的 JSON 字符串
- `--billing <strategy>` — 计费策略（如 `preCall`）

**示例：**
```bash
synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"hello"}]}'
synapse connect deepseek chat --input '{"messages":[]}' --billing preCall
```

### setup — 交互式初始化向导

```bash
synapse setup
```

首次运行的交互式设置，引导用户选择 Provider、配置 API Key 和基础参数。

### config — 配置管理

```bash
synapse config set|get|list [key] [value]
```

支持点号记法访问嵌套配置（如 `billing.*`）。

**示例：**
```bash
synapse config set billing.strategy perToken
synapse config set billing.limit 50
synapse config get billing.strategy
synapse config list
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
synapse billing init --strategy perToken --limit 10 --provider deepseek
synapse billing status
synapse billing status --format json
```

### route — 多维评分路由

```bash
synapse route <intent> [--strategy <strategy>] [--exclude <providers>] [--region <region>] [--min-version <version>]
```

**参数：**
- `<intent>` — 意图类型（如 `chat`, `text-to-image`）
- `--strategy` — 路由策略：`cheap` / `fast` / `quality` / `balanced`（默认）/ `cost-capped`
- `--exclude` — 排除的 Provider 列表
- `--region` — 偏好地区（如 `us-east`, `eu-west`, `apac`）
- `--min-version` — 最低模型版本（如 `3.5`, `4.0`）

**示例：**
```bash
synapse route chat --strategy quality
synapse route chat --exclude openai --region apac --min-version 3.5
```

### sdk generate — 生成零依赖 SDK

```bash
synapse sdk generate --pack <pack> --lang <lang> --output <dir> [--with-billing]
```

**参数：**
- `--pack <id>` — Pack ID 或路径（必填）
- `--lang <lang>` — `typescript` | `python`（必填）
- `--output <dir>` — 输出目录（必填）
- `--with-billing` — 包含 BillingTracker 类

**示例：**
```bash
synapse sdk generate --pack openai --lang typescript --output ./synapse-sdk
synapse sdk generate --pack openai --lang typescript --output ./synapse-sdk --with-billing
```

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
synapse pack search deepseek
synapse pack add deepseek-v3
synapse pack list
synapse pack list --remote
```

### provider — 浏览和检查 Provider Pack

```bash
synapse provider list [--remote]
synapse provider show <id> [--remote]
```

**示例：**
```bash
synapse provider list
synapse provider list --remote
synapse provider show openai
```

### vault — 管理加密 API Key

```bash
synapse vault set|list|get|remove|verify|rotate
```

**子命令：**
- `set <provider> <key> [--base-url <url>] [--pack <id>]` — 存储加密 API Key
- `list` — 列出已存储的 Provider（值隐藏）
- `get <provider>` — 读取指定 Provider 的 Key
- `remove <provider>` — 删除指定 Key
- `verify <provider>` — 验证 Key 格式
- `rotate <provider>` — 交互式密钥轮换

**示例：**
```bash
synapse vault set deepseek sk-xxx --base-url https://api.deepseek.com/v1
synapse vault list
synapse vault verify deepseek
synapse vault get deepseek
synapse vault remove deepseek
```

### negotiate — 运行 Schema 协商

```bash
synapse negotiate <schema-file> [options]
synapse negotiate --intent <intent> --provider <provider> [--no-cache]
```

**示例：**
```bash
synapse negotiate ./my-agent-schema.json
synapse negotiate --intent chat --provider openai
synapse negotiate --intent chat --provider openai --no-cache
```

### lock — 管理 Schema Lock

```bash
synapse lock list|show|remove|migrate|outdated
```

**子命令：**
- `list` — 列出所有 Schema Lock
- `show <lock-id>` — 显示 Lock 详情
- `remove <lock-id>` — 删除 Lock
- `migrate <lock-id> <new-pack-version>` — 迁移 Lock
- `outdated` — 检测过期 Lock

**示例：**
```bash
synapse lock list
synapse lock outdated
synapse lock migrate chat_lock_v1 1.2.0
```

### sdk — SDK 生成

```bash
synapse sdk generate [--pack <id>] [--lang typescript|python] [--output <dir>]
```

**示例：**
```bash
synapse sdk generate --pack openai --lang typescript --output ./sdk
synapse sdk generate --pack deepseek --lang python
```

### 从 OpenAPI Spec 生成 Provider Pack（库 API）

`synapse generate` 命令已下线，请使用 `@synapse-router/pack-generator` 的编程 API：

```typescript
import { generatePackFromURL, writePack } from "@synapse-router/pack-generator";

const { providerCard, dslFiles } = await generatePackFromURL(
  "https://api.example.com/openapi.json",
  { providerId: "myapi", providerName: "My API", authType: "Bearer" }
);
await writePack("./packs/myapi", providerCard, dslFiles);
```

### smoke — Provider 冒烟测试

```bash
synapse smoke --provider <name> [--intent <intent>]
```

### init — 初始化项目

```bash
synapse init [--name <name>] [--dir <dir>] [--pack <id>]
```

初始化一个 synapse-sdk 项目结构。

### profile — Provider Profile 管理

```bash
synapse profile list|show|reset|stats
```

查看和管理 Provider Profile 数据。

### watchdog — 监控事件管理

```bash
synapse watchdog [--interval <seconds>] [--slack-webhook <url>]
```

监控事件并自动创建 Git Issues。

### export — 导出运行时数据

```bash
synapse export [--output <file>] [--stdout]
```

导出 `.synapse/` 目录数据为 tar.gz 格式。

### import — 导入运行时数据

```bash
synapse import <file> [--stdin]
```

导入先前导出的 `.synapse/` 数据。

## Schema 协商与 SDK 生成

Synapse Router 的 Schema 协商管道是连接 Agent 需求与 Provider 能力的核心机制。

### Provider Pack 结构

每个 Provider 通过 Pack 声明其能力。Pack 结构定义在 `packs/<provider-id>/` 目录：

```
packs/<provider-id>/
├── provider-card.json   # Provider 能力声明（身份 + 服务配置 + 功能列表 + 字段映射）
└── dsl/                 # 每个 Feature 一个 Agent Schema DSL 文件
    ├── chat_post_v1_chat_completions.json
    └── ...
```

**provider-card.json** 由三个顶级对象组成：
- `provider` — 身份标识：`id`, `name`, `docs_url`, `auth_type`
- `service` — 服务配置：`id`, `version`, `api_version`, `base_url`, `auth_type`
- `features` — 功能声明数组：每个 feature 包含 `id`, `intent`, `name`, `input`/`output` 字段定义、`field_mappings`, `pricing`, `limits`

### Intent 匹配

协商引擎（`@synapse-router/negotiator`）将 Agent 的意图匹配到 Provider 的 Feature：

| 结果 | 含义 |
|------|------|
| `accepted` | Intent 完全匹配，Schema 兼容 |
| `adapted` | 存在字段差异，但可通过 field_mappings 适配 |
| `rejected` | 不兼容的 Schema 或缺少必要能力 |

匹配过程包含字段级 Manifest 约束检查：`required`、`type`、`enum`、`minLength`、`maxLength`。差异被结构化记录为 `ManifestMatchResult`（`missing`、`extra`、`type_mismatch`）。

还支持 `retryWithFeedback` 结构化重试机制（MAX_RETRIES=2），以及 Fire-and-forget Registry 异步验证提交。

### SDK 生成流程

`synapse sdk generate` 是 SDK 生成的入口，其处理流程：

1. **读取 Provider Pack** — 从 `packs/`、Registry 和本地目录加载所有 Provider Pack
2. **协商 Schema Lock** — 对每个 Provider 的 Feature 执行协商，创建 Schema Lock
3. **生成代码** — 根据 Lock 中的字段映射生成 TypeScript / Python SDK 代码
4. **输出** — 写入 `--output` 目录（默认 `./synapse-sdk`），零外部依赖

SDK 生成器（`@synapse-router/sdk-generator`）将 Pack DSL 转换为纯函数代码，使用内置 `fetch`，不依赖 `@synapse-router/*`。

### Schema Lock 系统

Schema Lock 类似 `package-lock.json`，是对 Schema 契约的冻结：
- **不可变** — 一旦锁定不自动随 Pack 更新变化
- **确定性** — 相同输入得到相同输出，消除运行时意外
- **过期检测** — `synapse lock outdated` 检测 Pack 版本变化后需要重新协商的 Lock
- **迁移** — `synapse lock migrate` 将现有 Lock 迁移到新 Pack 版本

## Provider 路由

多维评分路由引擎（`@synapse-router/router`）根据策略对候选 Provider 进行评分、过滤、排序。路由是纯函数，相同输入始终得到相同输出。

### 路由策略

| 策略 ID | 名称 | 权重分布 (cost/latency/reliability/featureMatch/preference) | 适用场景 |
|---------|------|------------------------------------------------------------|---------|
| `cheap` | 成本优先 | 5 / 1 / 1 / 1 / 0.5 | 成本敏感型场景 |
| `fast` | 速度优先 | 1 / 5 / 1 / 1 / 0.5 | 实时交互场景 |
| `quality` | 质量优先 | 0.25 / 0.25 / 6 / 4 / 0.5 | 质量关键型场景 |
| `balanced` | 均衡策略（默认） | 1 / 1 / 1 / 1 / 0.5 | 通用场景 |
| `cost-capped` | 预算封顶 | 3 / 1 / 2 / 2 / 0.5 (+ maxCost 过滤) | 有预算约束场景 |

### 评分维度

每个候选 Provider 在 5 个维度上评分（归一化到 [0, 100]）：
- `cost` — 成本（Feature 级别成本系数 + 输入规模预估）
- `latency` — 延迟（Provider 延迟等级 + 地区匹配加分）
- `reliability` — 可靠性（Provider 可靠性系数 0~1）
- `featureMatch` — 功能匹配（Intent 精确/模糊匹配 + 地区前缀 + 版本过滤）
- `preference` — 偏好（用户指定的 preferredProviders 提权）

加权总分公式：`totalScore = Σ(dimensionScore × weight)`。

### 决策可解释

每次路由结果包含完整决策记录（`RouteResult.explanation`）：
- `intent` — 路由目标意图
- `totalCandidates` — 总候选 Provider 数
- `filteredAfterConstraints` — 被过滤的 Provider 数
- `strategyWeights` — 使用的权重向量
- `failoverChain` — 降级链

### 运行时无路由

路由决策在开发时通过 `synapse sdk generate` 完成，运行时路径不包含路由引擎。生成的 SDK 直接调用选定的 Provider，零决策开销。

## Billing 集成

Billing 模块（`@synapse-router/billing`）为 Provider 调用提供用量计费和配额管理能力。

### 初始化与配置

```bash
synapse billing init [--strategy <s>] [--limit <n>] [--provider <id>]
synapse billing config [set|get]
synapse billing status [--format json|table]
```

交互式向导引导用户完成：选择 Pricing 策略、设置配额限制、选择目标 Provider、配置降级策略。

通过 `synapse config set billing.*` 点号记法访问 billing-config.json：
```bash
synapse config set billing.strategy perToken
synapse config set billing.limit 50
```

### 配额管理

配额持久化使用 **FileQuotaStorage**，存储在 `~/.synapse/quotas/`：
- 原子写入（`.tmp` + `rename` 模式，防止并发损坏）
- 支持配额类型：`tokens`、`requests`、`cost`
- 支持时间周期：`minute`、`hour`、`day`、`month`、`oneTime`
- 阈值告警：到达 `threshold`（如 80%）时触发 warn

### 定价策略

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| `flat` | 按次固定费率 | 固定价格 API |
| `perToken` | 按 Token 计费（input/output 分开） | LLM API |
| `perUnit` | 按单位计费 | 图片生成 API |
| `tiered` | 阶梯定价（用量越大单价越低） | 批量调用 |

定价规则从 Provider Card 的 `features[].pricing` 字段提取，通过 `pricingFromProviderCard` 纯函数桥接。

### 自动包裹

当 billing 配置存在时，`synapse connect` 自动包裹 Connector：
```
connect → createBillingConnector(connector) → preCall (check quota) → execute API → postCall (consume quota)
```

Billing 错误默认不阻塞 API 调用（graceful degradation）。

### 降级策略

| 策略 | 行为 |
|------|------|
| `warn`（默认） | 记录告警但不阻止调用 |
| `reject` | 超出配额时拒绝调用 |
| `downgrade` | 自动降级到低价 Provider |
| `notify` | 发送通知并继续执行 |

## 架构原则与关键约束

### 11 条架构原则

1. **先有契约，再调用** — 每次路由都从 Schema 契约开始，只有契约明确后才允许调用 Provider
2. **协商必须显式** — Schema 变化必须可见，降级/适配/拒绝需提供结构化原因，不静默 fallback
3. **Provider 可替换，但不等价** — Adapter 诚实暴露能力，Router 根据契约匹配度/成本/延迟做选择
4. **输出标准化** — 应用代码消费 Router 定义的结果类型，Provider 私有响应结构限制在 Adapter 内
5. **Core 最小，边界可扩展** — Core 只定义契约、协商结果、路由决策和错误形态
6. **路由可观察** — 每次路由决策可解释：请求 Schema、选中 Provider、协商结果和原因码可追踪
7. **开发时协商，运行时无感** — 复杂逻辑在开发时完成，运行时只有纯代码
8. **无运行时 LLM** — 运行时路径零 Token 成本，不依赖任何 LLM 调用
9. **运行时 = 纯代码 SDK** — 运行时环境无 Router、无 LLM、无随机决策，只有生成的确定性 SDK 代码
10. **产线日志回流开发** — `.synapse/` 日志通过 Git 从产线同步到开发环境
11. **Watchdog 独立部署** — synapse watchdog 是独立进程，不嵌入 SDK，保持 SDK 零依赖

### 6 项关键设计约束

- **Connector 是薄连接层**：只做 HTTP 请求 + 字段映射 + base_url 覆盖，不处理业务逻辑
- **Schema Lock 不可变**：一旦锁定不自动随 Pack 更新变化，类似 `package-lock.json`
- **SDK 零依赖**：生成的 SDK 不依赖 `@synapse-router/*`，只使用内置 `fetch`
- **Vault 永不明文落盘**：AES-256-GCM 加密 + 内存解密 + 写回即焚
- **Registry 是可选增强**：Router 在无 Registry 时仍可正常工作
- **API Key 不出现在日志**：所有 Trace/Span 自动 redact

## Sub-Agent 调度

本项目使用 `AGENTS.md` 中定义的专用 sub-agent 完成复杂任务。通过 `Agent` 工具以 `subagent_type=general-purpose` 调度。

| Agent | 领域 | 核心交付物 |
|-------|------|-----------|
| **Synapse Core Developer** | core/negotiator/router | 类型定义、Schema 校验、协商算法、路由策略 |
| **Provider Pack Developer** | packs/, pack-generator | provider-card.json、DSL 文件、Pack 验证 |
| **Connector Developer** | connector/lock/vault | HTTP 请求构建、字段映射、Lock 缓存、加密存储 |
| **CLI Developer** | apps/cli | CLI 命令实现、交互式提示、--help 文档、输出格式化 |
| **API Developer** | apps/api | REST API 端点、请求验证、错误处理中间件 |
| **SDK Generator Developer** | packages/sdk-generator | TypeScript/Python SDK 模板、类型映射、代码生成 |
| **Test Engineer** | 所有包的测试、E2E | 单元测试、集成测试、Mock/Fixture |
| **Documentation Writer** | knowledge/, docs/ | 知识库文档、API 文档、Pack 文档 |

## 常用代码模式

### 创建 CLI 命令

```typescript
// apps/cli/src/commands/mycommand.ts
import { red, green } from "node:util";

export function printMyCommandHelp(): void {
  console.log(`
synapse mycommand <arg> [options]

Arguments:
  <arg>                    Description of argument

Options:
  --flag <value>           Description of flag

Examples:
  synapse mycommand value
`);
}

export async function handleMyCommand(rawArgs: string[]): Promise<void> {
  // Implementation
}
```

在 `apps/cli/src/index.ts` 中注册命令：在 `main()` 函数的 `switch` 中添加 case。

### 创建 Provider Pack

```bash
# 手动创建 Pack 结构
mkdir -p packs/my-provider/dsl/

# provider-card.json 模板
cat > packs/my-provider/provider-card.json << 'JSON'
{
  "provider": { "id": "my-provider", "name": "My Provider", "auth_type": "Bearer" },
  "service": { "id": "my-provider", "version": "1.0.0", "base_url": "https://api.example.com/v1" },
  "features": [
    {
      "id": "chat_post_v1_chat_completions",
      "intent": "chat",
      "name": "Chat Completions",
      "input": { "fields": [...] },
      "output": { "fields": [...] },
      "field_mappings": [...],
      "pricing": { "unit": "perToken", "input": 0.01, "output": 0.02 }
    }
  ]
}
JSON
```

### 编写测试（Node.js 原生 test runner）

```typescript
// packages/my-pkg/src/my-module.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("MyModule", () => {
  it("should return expected value when given valid input", () => {
    const result = myFunction("valid-input");
    assert.equal(result, "expected-output");
  });
});
```

运行：`cd packages/my-pkg && node --experimental-test-coverage --test`

### 添加新包

```bash
# 在 packages/ 下创建
mkdir -p packages/my-pkg/src
cd packages/my-pkg && pnpm init

# tsconfig.json — 继承根配置
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src"]
}

# package.json — 命名遵循 @synapse-router/<name>
{
  "name": "@synapse-router/my-pkg",
  "type": "module",
  "main": "./dist/index.js",
  "scripts": { "build": "tsc", "test": "node --experimental-test-coverage --test" }
}
```
