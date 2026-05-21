---
sidebar_position: 1
title: synapse connect
---

# synapse connect — 连接 Provider 并执行

connect 命令连接指定 Provider（如 `deepseek`、`openai`）并执行一个功能（Intent），如 `chat`、`text-to-image`。命令会查找 Provider 的 Schema Lock，通过 Connector（薄连接层）发起 HTTP 调用，并将 Provider 的私有响应结构映射为标准输出。

当 billing 配置存在时，connect 命令自动包裹计费追踪（Billing Tracking）：每次调用前检查配额（Quota Check），调用后记录用量（Usage Recording）。billing 错误默认不阻塞 API 调用，仅产生告警。

## 参数 (Parameters)

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `<provider>` | string | 是 | Provider ID（如 `deepseek`, `openai`） |
| `<intent>` | string | 是 | 意图类型（如 `chat`, `text-to-image`） |
| `--input <json>` | string | 是 | 输入参数的 JSON 字符串 |
| `--billing <strategy>` | string | 否 | 计费策略（如 `preCall`），billing 配置存在时自动包裹 |

## 示例 (Examples)

### Example 1 — Chat with DeepSeek

```bash
synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"你好，请介绍一下 Synapse Router"}]}'
```

### Example 2 — Chat with OpenAI

```bash
synapse connect openai chat --input '{"messages":[{"role":"user","content":"What is the capital of France?"}],"model":"gpt-4o-mini"}'
```

### Example 3 — With billing pre-call check

```bash
synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"Hello"}]}' --billing preCall
```

### Example 4 — Text-to-image with model parameter

```bash
synapse connect stability-ai text-to-image --input '{"prompt":"A serene mountain lake at sunset","width":1024,"height":1024}'
```

## 计费包裹 (Billing Wrapping)

当 billing 配置存在时，connect 命令对 Connector 进行自动包裹（Auto Wrapping），执行流程如下：

1. **preCall** — 检查配额（Quota）是否充足，如果超出限额则根据降级策略（Downgrade Strategy）决定行为
2. **Execute** — 执行实际的 API 调用
3. **postCall** — 调用完成后记录用量消耗

billing 错误默认不阻塞 API 调用（`warn` 策略），仅记录告警。

## 注意事项 (Notes)

- API Key 需要提前通过 [synapse vault set](/docs/cli/vault) 配置
- 首次使用可通过 [synapse setup](/docs/cli/setup) 交互式向导完成配置，向导会引导选择 Provider 和配置 API Key
- `--billing` 参数激活后，每次调用自动检查配额（Quota），超出配额时的行为由降级策略（Downgrade Strategy）决定，可选 `warn`、`reject`、`downgrade`、`notify`
- 更多 billing 配置请参考 [`synapse billing`](/docs/cli/billing)
- Provider Pack 的管理（安装、更新、删除）通过 [`synapse pack`](/docs/cli/pack) 完成
