---
sidebar_position: 2
title: synapse vault
---

# synapse vault — Manage Encrypted API Keys

The vault command manages encrypted storage of Provider API Keys. It uses the AES-256-GCM encryption algorithm. Keys are never stored in plaintext on disk, and all logs are automatically redacted.

## Subcommands

| Subcommand | Description |
|--------|------|
| `set <provider> <key>` | Store an encrypted API Key, optionally with `--base-url` and `--pack` |
| `list` | List stored Providers (Key values hidden) |
| `get <provider>` | Read the Key for a given Provider |
| `remove <provider>` | Delete the Key for a given Provider |
| `verify <provider>` | Verify Key format |
| `rotate <provider>` | Interactive key rotation |

## Parameters

| Parameter | Type | Required | Description |
|------|------|------|------|
| `<provider>` | string | Varies by subcommand | Provider ID |
| `<key>` | string | Required for `set` | API Key string |
| `--base-url <url>` | string | No | Custom API base URL |
| `--pack <id>` | string | No | Associated Pack ID |

## Examples

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

## Security

- **Encryption:** AES-256-GCM
- **Key Storage:** OS Keychain integration
- **In-Memory Decryption:** Cleared immediately after use
- **Log Redaction:** All Traces and Spans automatically redact API Keys
