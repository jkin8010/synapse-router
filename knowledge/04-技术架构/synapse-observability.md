# @synapse/observability — 跨项目可观测性与调试层

> **日期**: 2026-05-04
> **状态**: 规划中
> **发布策略**: Core + Router → npm 开源 (Apache 2.0) | Registry Spans → 闭源 (仅内部)

---

## 1. 现状审计

| 模块 | 日志状态 | 问题 |
|------|---------|------|
| **Connector** | ❌ 零日志 | 调用失败无法定位是映射、HTTP 还是 Provider 问题 |
| **API Server** | ❌ 只有 `console.log` 启动提示 | 请求内容、错误、延迟全无可追溯 |
| **Vault** | ✅ 有 `AuditLogger` | 仅覆盖密钥操作，格式独立，不联动 |
| **Negotiator** | ❌ 零日志 | 匹配失败时无法知道为什么被拒绝 |
| **CLI** | ❌ 无结构化日志 | 错误信息不携带调试上下文 |

**核心缺陷：没有跨模块的 Trace 机制，一次 `connect` 请求无法端到端追踪。**

---

## 2. 产品定位

> **不是传统的"日志库"，而是 Coding Agent 的问题排查工作台。**

每个事件都是结构化的、机器可解析的，不仅记录"发生了什么"，还记录"为什么"和"怎么办"。

### 设计原则

| 原则 | 说明 |
|------|------|
| **零侵入** | 各模块通过可选 `Tracer` 注入点记录，不影响主逻辑 |
| **隐私优先** | API Key 永远 redacted，input/output 可配置采样/脱敏 |
| **Agent 友好** | 错误自带 `hint` + `fix_suggestion`，Agent 可直接理解并修复 |
| **多输出** | JSONL 文件、控制台彩色输出、HTTP endpoint、结构化对象 |
| **轻量** | 无外部依赖，不拖慢主路径 |

---

## 3. 核心模型

### 3.1 Trace（端到端追踪）

一次完整的用户请求，从 negotiate 到 connect 完成：

```
trace_id: "tr_abc123"
├── spans:
│   ├── negotiate  → intent matching, accepted/rejected
│   ├── lock       → cache hit/miss, lock content
│   ├── connect    → HTTP call, mapping, response
│   └── billing    → cost estimation, quota check
└── metadata:
    ├── started_at, ended_at, total_latency_ms
    ├── source: "cli" | "api" | "sdk"
    ├── user_id / session_id
    └── tags: { env: "dev", feature: "text-to-image" }
```

### 3.2 Span（阶段记录）

每个 Span 记录一个阶段的关键信息：

```typescript
interface Span {
  id: string;
  name: 'negotiate' | 'lock' | 'connect' | 'billing';
  trace_id: string;
  started_at: string;
  ended_at?: string;
  attributes: Record<string, unknown>;  // 阶段特定属性
  events: SpanEvent[];                  // 阶段内事件
  status: 'ok' | 'error' | 'timeout';
  error?: TraceError;
  duration_ms: number;
}
```

### 3.3 Event（独立事件）

不依附于 Trace 的独立事件：

```
vault key set/rotate/verify
pack generation completed
sdk generation completed
quota exceeded / threshold alert
provider rate limit hit
```

### 3.4 TraceError（诊断增强错误）

```typescript
interface TraceError {
  type: "HTTP_ERROR" | "AUTH_ERROR" | "RATE_LIMIT" | "TIMEOUT"
      | "MAPPING_ERROR" | "SCHEMA_ERROR" | "QUOTA_EXCEEDED" | "UNKNOWN";
  message: string;
  status?: number;           // HTTP status
  hint: string;              // 人类可读的诊断提示
  fix_suggestion: string[];  // 具体可执行的建议
  context: Record<string, unknown>;  // 调试上下文
  stack?: string;
}

// 示例
{
  type: "AUTH_ERROR",
  status: 401,
  hint: "API Key 无效或已过期",
  fix_suggestion: [
    "检查 vault 中的 key: synapse vault verify deepseek",
    "到 Provider 控制台确认 key 状态",
    "如果 key 过期: synapse vault set deepsk <new_key>"
  ],
  context: {
    provider: "deepseek",
    base_url: "https://api.deepseek.com/v1",
    feature: "chat",
    trace_id: "tr_abc123"
  }
}
```

---

## 4. 场景化调试

### text-to-image 多路径追踪

text-to-image 可能有多种调用路径：

1. **直接调用**: connector → stability API
2. **兼容调用**: connector → OpenAI Pack → base_url 覆盖
3. **工作流调用**: connector → ComfyUI → 工作流执行

Trace 自动记录路径选择：

```
[trace_id] text-to-image 调用路径:
  1. Lock: cache_hit=false → 新建 lock (openai pack, text-to-image)
  2. Provider: openai (via base_url override → 兼容服务)
  3. 映射: prompt→prompt, n→n(1), size→1024x1024
  4. HTTP: POST https://api.compatible.com/v1/images/generations
  5. 响应: data[0].url = "https://..."
  6. 费用: $0.040
```

---

## 5. 输出格式

### 5.1 JSONL 文件（默认）

```
~/.synapse/traces/2026-05-04.jsonl
```

每行一个事件，按时间排序，支持按日期分文件。

### 5.2 控制台彩色输出

```bash
🔵 tr_abc123  negotiate  ✅  12ms   deepseek → chat
🟡 tr_abc123  lock       ⚠️  3ms    cache miss, created new lock
🔴 tr_abc123  connect    ❌  1200ms 401 Unauthorized → API Key invalid
   💡 synapse vault verify deepseek
```

### 5.3 HTTP Endpoint 推送

```typescript
outputs: [
  { type: 'http', url: 'http://localhost:3011/api/traces' }
]
```

实时推送到 web UI 或集中式日志服务。

### 5.4 内存缓存

最近 N 条 trace 保留在内存中，支持快速查询。

---

## 6. 采样策略

| 模式 | 说明 |
|------|------|
| `all` | 记录所有请求（开发环境） |
| `errors-first` | 错误 100% 记录，成功请求采样 |
| `percent` | 按百分比采样（如 10%） |
| `none` | 关闭（生产环境默认） |

---

## 7. 隐私保护

| 配置 | 说明 |
|------|------|
| `apiKeys: true` | API Key 永远显示为 `sk-***` |
| `inputPreview: true` | input 只显示前 100 字符 |
| `outputPreview: true` | output 只显示前 200 字符 |
| `fullBody: false` | 不记录完整请求/响应体 |

---

## 8. 包结构

### 开源部分 (npm 发布, Apache 2.0)

```
@synapse/observability/  ← 仓库位置: synapse-observability (独立仓库)
├── src/
│   ├── index.ts              # 公开导出
│   ├── types.ts              # Trace, Span, Event, TraceError
│   ├── tracer.ts             # TraceEngine 主类
│   ├── outputs/
│   │   ├── jsonl.ts          # JSONL 文件输出
│   │   ├── console.ts        # 控制台彩色输出
│   │   ├── http.ts           # HTTP endpoint
│   │   └── memory.ts         # 内存缓存
│   ├── error-diagnosis.ts    # 错误诊断引擎
│   ├── sampler.ts            # 采样策略
│   ├── redactor.ts           # 敏感信息脱敏
│   │
│   └── router/               # Router 专用 Span ✅ 发布
│       ├── negotiate.ts
│       ├── lock.ts
│       ├── connect.ts
│       └── billing.ts
├── tests/
│   ├── tracer.test.ts
│   ├── error-diagnosis.test.ts
│   ├── sampler.test.ts
│   ├── redactor.test.ts
│   └── router/               # Router spans 测试
└── package.json
     "name": "@synapse/observability"
     "license": "Apache-2.0"
     "exports": {
       ".": "./dist/index.js",
       "./router": "./dist/router/index.js"
     }
```

### 闭源部分 (synapse-registry 内部)

```
synapse-registry/packages/observability-registry/  ← 闭源，不发布
├── src/
│   ├── index.ts              # Registry 内部导出
│   ├── pack-gen.ts           # 8 步 LLM 流水线 Span
│   ├── change-detect.ts      # Change Detector Span
│   ├── webhook.ts            # Webhook 投递 Span
│   ├── storage.ts            # Pack 存储 Span
│   └── hono-middleware.ts    # Hono 中间件
├── tests/
│   └── ...                   # 内部测试
└── package.json
     "name": "@synapse-registry/observability-internal"  ← 私有包
     "private": true
```

---

## 9. API 设计

### 9.1 初始化

```typescript
import { createTracer } from '@synapse-router/observability';

const tracer = createTracer({
  outputs: [
    { type: 'jsonl', path: '~/.synapse/traces/' },
    { type: 'console', level: 'warn' }
  ],
  sampling: { mode: 'errors-first', percent: 10 },
  redact: { apiKeys: true, inputPreview: true, outputPreview: true },
  maxTraces: 1000,
  retentionDays: 7
});
```

### 9.2 创建 Trace

```typescript
const trace = tracer.trace('user-request-123');
```

### 9.3 记录 Span

```typescript
// 开始 Span
trace.span('negotiate').start({ agent_schema: {...} });

// 记录事件
trace.span('negotiate').record('match_found', {
  provider: 'deepseek',
  feature: 'chat',
  mapping_count: 8
});

// 结束 Span
trace.span('negotiate').end({
  accepted: [...],
  rejected: [...]
});

// 记录错误
trace.span('connect').recordError(error);
```

### 9.4 查询

```typescript
tracer.getTrace('tr_abc123');                      // 获取完整 trace
tracer.listTraces({ provider: 'deepseek', since: '2026-05-04' });
tracer.export('tr_abc123', 'json');                 // 导出 JSON
tracer.diagnose({ since: '1h' });                   // 自动诊断最近错误
```

### 9.5 CLI 命令

```bash
synapse traces list
synapse traces list --provider deepseek --since 1h
synapse traces show tr_abc123
synapse traces export tr_abc123 --format json
synapse traces diagnose --since 1h
```

---

## 10. 双项目共享架构

### 10.1 定位

`@synapse/observability` 是**独立的共享包**，不在 router 或 registry 之下，而是作为两者的共同依赖。

```
@synapse/observability (共享包)
├── core/
│   ├── tracer.ts          # TraceEngine 主类
│   ├── types.ts           # 通用类型 (Trace, Span, TraceError, Event)
│   ├── outputs/           # 输出适配器
│   ├── sampler.ts         # 采样
│   ├── redactor.ts        # 脱敏
│   └── error-diagnosis.ts # 错误诊断
│
├── router/                # Router 专用 Span 类型
│   ├── negotiate.ts
│   ├── lock.ts
│   ├── connect.ts
│   └── billing.ts
│
└── registry/              # Registry 专用 Span 类型
    ├── pack-gen.ts        # Pack 生成 (8 步 LLM 流水线)
    ├── change-detect.ts   # Change Detector (crawl → diff → notify)
    ├── webhook.ts         # Webhook 投递追踪
    ├── storage.ts         # Pack 存储 (checksum/packaging)
    └── api.ts             # HTTP 请求追踪 (Hono 中间件)
```

### 10.2 发布策略 — 开源 / 闭源分离

```
@synapse/observability  (npm 开源, Apache 2.0)
├── core/              ✅ 发布 — Tracer, Types, Outputs, Sampler, Redactor
├── router/            ✅ 发布 — Negotiate, Lock, Connect, Billing Spans
│
├── registry/          ❌ 不发布 — PackGen, ChangeDetect, Webhook, Storage
│                        （闭源，仅在 synapse-registry 内部使用）
└── package.json
     "name": "@synapse/observability"
     "license": "Apache-2.0"
     "exports": {       ← 只暴露开源部分
       ".": "./src/index.ts",
       "./router": "./src/router/index.ts"
     }
```

### 10.3 为什么这样分

| 部分 | 开源理由 | 闭源理由 |
|------|---------|----------|
| **Core** | 通用 Trace 基础设施，社区用户需要排查 connector 调用问题 | — |
| **Router Spans** | 社区用户使用 synapse-router 时需要端到端调试能力 | — |
| **Registry Spans** | — | Registry 是闭源服务，Pack 生成流水线、Change Detector 是商业逻辑 |

### 10.4 项目依赖关系

```
synapse-router/ (开源)
├── packages/connector/
├── packages/negotiator/
├── packages/lock/
├── packages/billing/
│
└── 依赖 → @synapse/observability (npm) ← 社区用户也用这个


synapse-registry/ (闭源)
├── packages/pack-generator/
├── packages/change-detector/
├── packages/pack-storage/
│
└── 依赖 → @synapse/observability (npm core) + 内部 registry spans (闭源)
```

### 10.5 社区用户能做什么

安装了 `@synapse/observability` 后，开源社区用户可以：

1. **追踪 connect 调用**: 端到端 Trace（negotiate → lock → connect → billing）
2. **诊断错误**: 自动 hint + fix_suggestion
3. **导出 Trace 给 Agent**: 把 trace 导出为 JSON，让 Coding Agent 分析
4. **CLI 调试**: `synapse traces list/show/export/diagnose`
5. **自定义 Span**: 通过 `tracer.span('custom')` 记录自己的业务逻辑

### 10.6 构建时排除 Registry Spans

```json
// @synapse/observability package.json
{
  "name": "@synapse/observability",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./router": { "import": "./dist/router/index.js", "types": "./dist/router/index.d.ts" }
  },
  "files": [
    "dist/core",
    "dist/router",
    "dist/*.js",
    "dist/*.d.ts"
  ]
}
```

`registry/` 目录不参与 npm 发布。registry spans 在 synapse-registry monorepo 内部单独维护。

---

## 11. Registry Spans (闭源，仅内部使用)

⚠️ 以下内容在 synapse-registry 内部维护，不发布到 npm。

### 11.1 Pack 生成 (8 步 LLM 流水线)

Pack Generator 的每一步都是一个 Span：

```
trace_id: "tr_gen_xyz789"
├── span: pack_generation
│   ├── attributes: { provider_id, source_url, namespace }
│   │
│   ├── sub_span: fetch           → URL 抓取结果
│   ├── sub_span: parse           → OpenAPI/文档解析
│   ├── sub_span: extract_features → 功能提取 (LLM)
│   ├── sub_span: extract_fields   → 字段提取 (LLM)
│   ├── sub_span: generate_mappings → 映射生成 (LLM)
│   ├── sub_span: infer_transforms  → 转换推断 (LLM)
│   ├── sub_span: generate_docs     → 文档生成 (LLM)
│   ├── sub_span: validate          → 输出验证
│   └── sub_span: assemble          → Pack 组装
│
└── metadata:
    ├── total_llm_calls: 5
    ├── total_llm_cost: $0.032
    ├── total_duration_ms: 45000
    └── success: true/false
```

**Coding Agent 用途**：
- 哪一步失败？→ 定位是 prompt 问题还是解析问题
- LLM 返回了什么？→ 分析 prompt 质量
- 对比成功/失败的 pack → 找到 pattern

### 11.2 Change Detection (周期性检测)

```
trace_id: "tr_cdc_abc123"
├── span: change_detection_cycle
│   ├── attributes: { provider_id, schedule_id }
│   │
│   ├── sub_span: crawl        → 抓取结果、内容 hash
│   ├── sub_span: diff         → 变更类型、变更内容
│   └── sub_span: notify       → webhook 投递结果
│
└── metadata:
    ├── change_detected: true/false
    ├── change_type: "breaking" | "additive" | "deprecating"
    ├── webhook_delivered: true/false
    └── duration_ms: 3200
```

**运维 Agent 用途**：
- 检测 Provider API 变更频率
- 识别 breaking change 模式
- 自动提交 Pack 更新任务

### 11.3 Webhook 投递追踪

```
trace_id: "tr_webhook_def456"
├── span: webhook_delivery
│   ├── attributes: { webhook_id, url, event_type }
│   ├── http_status: 200 / 429 / 500
│   ├── retry_count: 2
│   └── response_time_ms: 450
```

### 11.4 Pack 存储操作

```
trace_id: "tr_storage_ghi789"
├── span: pack_storage
│   ├── attributes: { pack_id, version, namespace }
│   ├── sub_span: checksum   → SHA-256 计算
│   ├── sub_span: packaging  → tarball 生成
│   └── sub_span: upload     → 存储上传结果
```

### 11.5 API 请求追踪 (Hono 中间件)

Registry 使用 Hono，可以添加中间件自动追踪：

```typescript
// Registry 内部使用（闭源）
import { createHonoTracer } from '../observability-internal/registry';

app.use('*', traceMiddleware({
  tracer,
  skipPaths: ['/health', '/api/v1/providers'],
  includeBody: process.env.NODE_ENV === 'development',
}));
```

---

## 12. 运维 Agent 跨项目工作流

运维 Agent 可以同时分析两个项目的 traces：

### 场景 1: Provider 问题排查

```
用户报告: "Stability 的 text-to-image 调用失败"

运维 Agent 操作:
1. 读取 router traces → 找到 stability 相关失败 trace
2. 读取 registry traces → 检查 stability pack 是否有更新
3. 对比 → 发现 stability API 文档有 breaking change
4. 结论 → Pack 版本过期，需要重新生成
5. 自动提交 → 创建 Pack 更新任务到 registry
```

### 场景 2: Pack 生成失败诊断

```
用户报告: "生成的火山引擎 Pack 有问题"

运维 Agent 操作:
1. 读取 registry traces → 找到 pack_generation trace
2. 检查每一步 Span → 发现 extract_features 失败
3. 分析 LLM prompt/response → prompt 不够具体
4. 结论 → 需要改进 feature extraction prompt
5. 自动提交 → 创建 issue 到 synapse-registry
```

### 场景 3: 端到端问题定位

```
用户报告: "connect 调用返回 401"

Coding Agent 操作:
1. 读取 router traces → 找到 connect trace
2. 检查 HTTP Span → 401 from https://api.deepseek.com/v1
3. 读取 vault audit → key 最后更新于 30 天前
4. 诊断 → API Key 过期
5. 自动建议 → synapse vault set deepseek <new_key>
```

---

## 13. 与现有模块的关系 (Router)

```
┌─────────────┐  ┌──────────────┐  ┌──────────────┐
│ Negotiator  │  │    Lock      │  │  Connector   │
│  (可选注入)  │  │  (可选注入)   │  │  (可选注入)   │
└──────┬──────┘  └──────┬───────┘  └──────┬───────┘
       │                │                  │
       └────────────────┼──────────────────┘
                        ▼
              ┌──────────────────┐
              │   Tracer (核心)   │
              └────────┬─────────┘
                       ▼
              ┌──────────────────┐
              │    Outputs       │
              │ JSONL / Console  │
              │ HTTP / Memory    │
              └──────────────────┘
```

- **零依赖**: observability 不依赖任何业务模块
- **可选注入**: 各模块接受可选的 `Tracer` 参数
- **无性能影响**: tracer 未配置时 overhead 为零

---

## 14. 与现有模块的关系 (Registry)

```
┌──────────────┐  ┌───────────────┐  ┌──────────────┐
│ pack-        │  │ change-       │  │ pack-        │
│ generator    │  │ detector      │  │ storage      │
│ (可选注入)    │  │ (可选注入)     │  │ (可选注入)    │
└──────┬───────┘  └───────┬───────┘  └──────┬───────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                          ▼
                ┌──────────────────┐
                │   Tracer (核心)   │
                └────────┬─────────┘
                         ▼
                ┌──────────────────┐
                │    Outputs       │
                │ JSONL / Convex   │
                │ HTTP / Memory    │
                └──────────────────┘
```

Registry 使用 Convex 作为后端，traces 可以：
- 本地 JSONL 文件（开发环境）
- Convex 函数写入数据库（生产环境）
- Hono 中间件自动追踪 API 请求

---

## 15. 运维 Agent 集成

运维 Agent 可以：

1. **读取** `.synapse/traces/` 目录的 JSONL 文件
2. **按 trace_id 重建**完整调用链
3. **识别模式**: "最近 10 次有 8 次 401" → 自动提交 issue
4. **对比分析**: 成功 vs 失败调用的差异
5. **生成报告**: 每日/每周系统健康报告

### 自动 Issue 生成

```typescript
// 运维 Agent 检测到模式后
const issue = {
  title: "[Bug] DeepSeek API 返回 401 - API Key 可能过期",
  body: `
## 问题描述
过去 24 小时内，8/10 次 DeepSeek chat 调用返回 401 Unauthorized。

## 影响范围
- Provider: deepseek
- Feature: chat
- 时间: 2026-05-03 18:00 ~ 2026-05-04 09:00
- 成功率: 20% (2/10)

## Trace 证据
\`\`\`json
${tracer.export('tr_abc123', 'json')}
\`\`\`

## 建议修复
1. 运行 \`synapse vault verify deepseek\` 确认 key 状态
2. 到 DeepSeek 控制台检查 key 是否过期
3. 重新设置 key: \`synapse vault set deepseek <new_key>\`
  `,
  severity: 'high'
};
```

---

最后更新：2026-05-04
