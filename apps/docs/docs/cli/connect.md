---
sidebar_position: 1
title: synapse connect
---

# synapse connect — Connect to a Provider and Execute

The `connect` command connects to a specified Provider (e.g. `deepseek`, `openai`) and executes an Intent such as `chat` or `text-to-image`. The command looks up the Provider's Schema Lock, makes HTTP calls through the Connector (a thin connection layer), and maps the Provider's private response structure to standardized output.

When billing configuration is present, the `connect` command automatically wraps Billing Tracking: it checks the quota before each call and records usage afterward. Billing errors do not block API calls by default — they only produce warnings.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `<provider>` | string | Yes | Provider ID (e.g. `deepseek`, `openai`) |
| `<intent>` | string | Yes | Intent type (e.g. `chat`, `text-to-image`) |
| `--input <json>` | string | Yes | JSON string of input parameters |
| `--billing <strategy>` | string | No | Billing strategy (e.g. `preCall`), automatically wrapped when billing config exists |

## Examples

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

## Billing Wrapping

When billing configuration is present, the `connect` command automatically wraps the Connector. The execution flow is as follows:

1. **preCall** — Checks if quota is sufficient; if exceeded, behavior is determined by the downgrade strategy
2. **Execute** — Performs the actual API call
3. **postCall** — Records usage consumption after the call completes

Billing errors do not block API calls by default (`warn` strategy); they only log warnings.

## Notes

- API Keys must be configured in advance via [synapse vault set](/docs/cli/vault)
- First-time users can complete configuration through the [synapse setup](/docs/cli/setup) interactive wizard, which guides selection of Providers and API Key configuration
- When `--billing` is active, each call automatically checks the quota. Behavior on exceeding the quota is determined by the downgrade strategy: `warn`, `reject`, `downgrade`, or `notify`
- For more billing configuration, see [`synapse billing`](/docs/cli/billing)
- Provider Pack management (install, update, delete) is handled through [`synapse pack`](/docs/cli/pack)
