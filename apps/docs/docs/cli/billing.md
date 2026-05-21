---
sidebar_position: 5
title: synapse billing
---

# synapse billing — 账单管理与配额查看

billing 命令管理 Provider 调用的用量计费（Usage Billing）和配额（Quota）。支持多种定价策略（Pricing Strategy）：`flat`（按次固定费率）、`perToken`（按 Token 计费）、`perUnit`（按单位计费）、`tiered`（阶梯定价）。配额持久化使用 FileQuotaStorage，存储于 `~/.synapse/quotas/`。

## 子命令 (Subcommands)

| 子命令 | 说明 |
|--------|------|
| `init [--strategy <s>] [--limit <n>] [--provider <id>]` | 交互式初始化计费配置 |
| `config [set\|get]` | 查看或修改计费配置 |
| `status [--format json\|table]` | 查看配额状态和预估费用 |

## 示例 (Examples)

Example 1 — Interactive initialization:
```bash
synapse billing init
```

Example 2 — Non-interactive init with parameters:
```bash
synapse billing init --strategy perToken --limit 10 --provider deepseek
```

Example 3 — Check status (table format):
```bash
synapse billing status
```

Example 4 — Check status (JSON format):
```bash
synapse billing status --format json
```

## 降级策略 (Downgrade Strategies)

| 策略 | 行为 |
|------|------|
| `warn`（默认） | 记录告警但不阻止调用 |
| `reject` | 超出配额时拒绝调用 |
| `downgrade` | 自动降级到低价 Provider |
| `notify` | 发送通知并继续执行 |

## 相关命令 (Related Commands)

- [synapse connect](/docs/cli/connect) — billing 自动包裹 connect 调用
- [synapse config](/docs/cli/config) — 通过 `synapse config set billing.*` 管理计费配置
- [synapse evolve --with-billing](/docs/cli/evolve) — 生成含 BillingTracker 的 SDK
