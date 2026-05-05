# @synapse-router/billing — 计费与限额模块

> **日期**: 2026-05-04
> **状态**: 实现中

---

## 1. 产品定位

为 Synapse Router 提供**独立计费和限额管理**能力，让应用层可以：
- 预估调用成本
- 追踪用量和花费
- 设置配额限额，超限后自动降级或拒绝
- 从 Pack 或 Registry 读取计费规则

**设计原则**：
- Billing 不依赖 Connector（单向：Billing 消费 Connector 结果）
- 计费策略可扩展（注册表模式）
- 零侵入：不修改 connector/negotiator 现有代码

---

## 2. 计费策略

### 2.1 perToken — Token 计费

适用：Chat / Embeddings 等按 token 计费的 feature

```
cost = (inputTokens × inputPrice + outputTokens × outputPrice) / unit
```

- `inputPrice`: 每 unit 输入 token 价格
- `outputPrice`: 每 unit 输出 token 价格
- `unit`: "1k tokens" 等

### 2.2 perUnit — 按次/按量计费

适用：图像(按张) / 音频(按分钟)

```
cost = quantity × unitPrice
```

- quantity 从输入参数推导（如 n=2 张图 → quantity=2）
- 音频从输入参数推导时长或使用默认估算

### 2.3 tiered — 阶梯计费

```json
{
  "strategy": "tiered",
  "tiers": [
    { "from": 0, "to": 1000000, "inputPrice": 0.0015, "outputPrice": 0.002 },
    { "from": 1000000, "to": 10000000, "inputPrice": 0.0010, "outputPrice": 0.0015 },
    { "from": 10000000, "to": null, "inputPrice": 0.0005, "outputPrice": 0.001 }
  ],
  "unit": "1k tokens"
}
```

用量落在不同区间，单价不同。

### 2.4 flat — 固定计费

```json
{
  "strategy": "flat",
  "costPerCall": 0.05,
  "unit": "per call"
}
```

每次调用固定费用，扣次数配额。

### 2.5 策略注册表（可扩展）

```typescript
// 应用层可以注册自定义策略
billing.registerStrategy("custom", myCustomStrategy);
```

---

## 3. 限额管理

### 3.1 Quota 类型

```typescript
interface Quota {
  id: string;
  type: "tokens" | "requests" | "cost";
  limit: number;
  used: number;
  period: "minute" | "hour" | "day" | "month";
  resetAt?: Date;       // 自动重置时间
  threshold?: number;   // 告警阈值 0-1（如 0.8 = 80%）
}
```

### 3.2 限额检查

```typescript
// preCall 时检查所有匹配的 Quota
// 如果任一 Quota 超限 → allowed = false
preCall({ lock, estimatedInputTokens: 500 }): PreCallResult
```

### 3.3 内置限额（从 Pack 读取）

Provider card 的 `limits` 字段（rpm / tpm）自动转为 Quota：

```json
// provider-card.json 中
"limits": {
  "rpm": 500,
  "tpm": 150000
}

// 自动创建:
// Quota { type: "requests", limit: 500, period: "minute" }
// Quota { type: "tokens", limit: 150000, period: "minute" }
```

---

## 4. Fallback 策略

| 策略 | 类型 | 行为 |
|------|------|------|
| `reject` | 拦截 | 返回 `BillingError(QUOTA_EXCEEDED)` |
| `downgrade` | 降级 | 返回建议的 provider/模型（如 → deepseek） |
| `queue` | 排队 | 返回等待时间（retryAfter） |
| `notify` | 仅通知 | 返回 warning，不拦截 |

```typescript
interface FallbackConfig {
  strategy: "reject" | "downgrade" | "queue" | "notify";
  downgradeTo?: string;  // provider id
  notifyCallback?: (warning: BillingWarning) => void;
}
```

---

## 5. API 设计

### 5.1 初始化

```typescript
import { Billing } from '@synapse-router/billing';

const billing = new Billing({
  // 计费规则来源
  pricing: {
    source: 'pack',         // 'pack' | 'registry' | 'custom'
    pack?: ProviderCard,    // source='pack' 时提供
    registryUrl?: string,   // source='registry' 时提供
    custom?: PricingRule[]  // source='custom' 时提供
  },

  // 限额配置
  quotas: Quota[],

  // 超限策略
  fallback: FallbackConfig,

  // 持久化（可选）
  storage?: QuotaStorage    // 默认内存，可传入 redis/sqlite 等
});
```

### 5.2 preCall — 调用前检查

```typescript
interface PreCallParams {
  lock: ConnectLock;              // 从 connector 复用
  estimatedInputTokens?: number;  // 预估输入 token 数
  estimatedQuantity?: number;     // 预估调用量（图像张数等）
  context?: Record<string, unknown>; // 额外上下文
}

interface PreCallResult {
  allowed: boolean;
  estimatedCost: number;          // 预估费用（USD）
  quotaStatus: QuotaStatus[];     // 各 Quota 当前状态
  warning?: BillingWarning;       // 接近限额时的警告
  fallback?: FallbackAction;      // 超限时建议的操作
}

// 使用
const pre = await billing.preCall({
  lock,
  estimatedInputTokens: 500
});

if (!pre.allowed) {
  console.log(pre.fallback); // { type: 'downgrade', to: 'deepseek' }
}
```

### 5.3 postCall — 调用后记录

```typescript
interface PostCallParams {
  lock: ConnectLock;
  result: ConnectResult;         // connector 返回的结果
  estimatedCost?: number;        // preCall 的预估费用
}

interface PostCallResult {
  actualCost: number;
  quotaUpdates: QuotaStatus[];   // 更新后的配额状态
  alerts: BillingAlert[];        // 触发告警的列表
}

// 使用
const post = await billing.postCall({
  lock,
  result: connectorResult
});

console.log(post.actualCost);    // $0.0031
console.log(post.alerts);        // [{ type: 'threshold', quota: 'daily_cost', at: 80% }]
```

### 5.4 getQuota — 查询配额状态

```typescript
billing.getQuota('daily_tokens'): QuotaStatus
billing.getAllQuotas(): QuotaStatus[]
billing.resetQuota('daily_tokens'): void
```

### 5.5 SDK 使用示例

```typescript
import { Billing, type Quota, type FallbackConfig } from '@synapse-router/billing';
import { connect } from '@synapse-router/connector';

// 1. 初始化
const billing = new Billing({
  pricing: { source: 'pack', pack: openaiProviderCard },
  quotas: [
    { id: 'daily_cost', type: 'cost', limit: 10, used: 0, period: 'day', threshold: 0.8 },
    { id: 'hourly_requests', type: 'requests', limit: 100, used: 0, period: 'hour' }
  ],
  fallback: { strategy: 'downgrade', downgradeTo: 'deepseek' }
});

// 2. 调用前
const pre = await billing.preCall({
  lock,
  estimatedInputTokens: estimateTokens(messages)
});

if (!pre.allowed) {
  // 触发 fallback
  if (pre.fallback?.type === 'downgrade') {
    console.log(`限额已满，建议切换到 ${pre.fallback.to}`);
  }
  return;
}

// 3. 执行调用
const result = await connect({ lock, input, connection });

// 4. 调用后
const post = await billing.postCall({ lock, result });

console.log(`实际费用: $${post.actualCost.toFixed(4)}`);
if (post.alerts.length > 0) {
  post.alerts.forEach(a => console.log(`⚠️ ${a.message}`));
}
```

---

## 6. 包结构

```
packages/billing/
├── src/
│   ├── index.ts            # 公开导出
│   ├── types.ts            # 全部类型定义
│   ├── billing.ts          # Billing 主类（preCall/postCall/getQuota）
│   ├── strategies/
│   │   ├── index.ts        # 策略注册表
│   │   ├── base.ts         # 策略基类
│   │   ├── per-token.ts    # Token 计费
│   │   ├── per-unit.ts     # 按次计费
│   │   ├── tiered.ts       # 阶梯计费
│   │   └── flat.ts         # 固定计费
│   ├── quota.ts            # 限额管理（检查/更新/重置）
│   ├── fallback.ts         # 降级策略
│   └── utils.ts            # 工具函数
├── tests/
│   ├── billing.test.ts
│   ├── per-token.test.ts
│   ├── per-unit.test.ts
│   ├── tiered.test.ts
│   ├── flat.test.ts
│   ├── quota.test.ts
│   └── fallback.test.ts
└── package.json
```

---

## 7. 与现有模块的关系

```
Connector  (不依赖 Billing)
    ↓ 返回 ConnectResult (含 usage)
Billing  (消费 Connector 结果)
    ↓ 可选
Registry (从 Pack 读取 pricing/limits)
```

- Connector → Billing：**无依赖**，Billing 只是消费 ConnectResult
- Billing → Registry：**可选依赖**，pricing source 可以是 pack / registry / custom
- CLI / API / SDK → Billing：**使用方**，在 connect 前后调用 preCall/postCall

---

最后更新：2026-05-04
