---
sidebar_position: 2
title: synapse vault
---

# synapse vault — 管理加密 API Key

vault 命令管理 Provider API Key 的加密存储。使用 AES-256-GCM 加密算法，Key 永不明文落盘（never stored in plaintext），所有日志自动脱敏（automatically redacted）。

## 子命令 (Subcommands)

| 子命令 | 说明 |
|--------|------|
| `set <provider> <key>` | 存储加密 API Key，可选择性指定 `--base-url` 和 `--pack` |
| `list` | 列出已存储的 Provider（Key 值隐藏） |
| `get <provider>` | 读取指定 Provider 的 Key |
| `remove <provider>` | 删除指定 Provider 的 Key |
| `verify <provider>` | 验证 Key 格式 |
| `rotate <provider>` | 交互式密钥轮换（Rotation） |

## 参数 (Parameters)

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `<provider>` | string | 视子命令而定 | Provider ID |
| `<key>` | string | `set` 时必需 | API Key 字符串 |
| `--base-url <url>` | string | 否 | 自定义 API 基础地址 |
| `--pack <id>` | string | 否 | 关联的 Pack ID |

## 示例 (Examples)

### Example 1 — Store DeepSeek API Key

```bash
synapse vault set deepseek sk-xxx --base-url https://api.deepseek.com/v1
```

### Example 2 — Store OpenAI API Key

```bash
synapse vault set openai sk-proj-xxxx --base-url https://api.openai.com/v1
```

### Example 3 — List all stored keys

```bash
synapse vault list
# deepseek (configured)
# openai (configured)
```

### Example 4 — Verify a key

```bash
synapse vault verify deepseek
# {"provider":"deepseek","valid":true}
```

### Example 5 — Rotate a key

```bash
synapse vault rotate deepseek
# Interactive: prompts for new key, replaces encrypted storage
```

## 安全性 (Security)

- **加密算法 (Encryption):** AES-256-GCM
- **密钥存储 (Key Storage):** OS Keychain 集成
- **内存解密 (In-Memory Decryption):** 使用后立即清除
- **日志脱敏 (Log Redaction):** 所有 Trace/Span 自动 redact API Key
