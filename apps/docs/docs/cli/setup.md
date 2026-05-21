---
sidebar_position: 9
title: synapse setup
---

# synapse setup — 交互式初始化向导

setup 命令启动交互式初始化向导（Interactive Setup Wizard），引导首次使用者完成 Provider 选择、API Key 配置和基础参数设置。适合新用户快速上手，无需记忆命令参数。

## 使用方法 (Usage)

```bash
synapse setup
```

## 向导流程 (Wizard Flow)

The interactive wizard guides through:

1. **选择 Provider** — 从已安装的 Pack 列表中选择目标 Provider（如 `deepseek`, `openai`）
2. **配置 API Key** — 输入 API Key，自动加密存储到 Vault（AES-256-GCM）
3. **设置基础参数** — 配置默认 model、base URL、billing 策略等
4. **确认配置** — 显示配置摘要并确认

## 示例 (Examples)

Example 1 — Start setup wizard:

```bash
synapse setup
# 交互式提示:
# ? Select a provider: deepseek
# ? Enter API Key: [hidden input]
# ? Default model: deepseek-chat
# ? Billing strategy: perToken
# ✓ Configuration saved
```

Example 2 — After setup, verify with connect:

```bash
synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"Hello"}]}'
```

## 相关命令 (Related Commands)

- [synapse vault set](/docs/cli/vault) — 手动配置 API Key
- [synapse config](/docs/cli/config) — 手动管理配置
