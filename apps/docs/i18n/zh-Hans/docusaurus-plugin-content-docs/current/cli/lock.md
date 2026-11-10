---
sidebar_position: 7
title: synapse lock
---

# synapse lock — 管理 Schema Lock

lock 命令管理 Schema 契约（Schema Contract）的冻结快照——Schema Lock。Schema Lock 类似 `package-lock.json`：一旦锁定后不可变（Immutable），不会自动随 Pack 更新变化，确保确定性（Deterministic）行为。支持过期检测（Outdated Detection）和迁移（Migration）。

## Schema Lock 特性 (Properties)

- **不可变 (Immutable)** — 一旦锁定后不会自动随 Pack 更新变化，确保确定性（Deterministic）行为
- **过期检测 (Outdated Detection)** — `synapse lock outdated` 检测 Pack 版本变化后需要重新协商的 Lock
- **迁移 (Migration)** — `synapse lock migrate` 将现有 Lock 迁移到新 Pack 版本

## 子命令 (Subcommands)

| 子命令 | 说明 |
|--------|------|
| `list` | 列出所有 Schema Lock |
| `show <lock-id>` | 显示 Lock 详情（Provider、Feature、版本、字段映射） |
| `remove <lock-id>` | 删除指定 Lock |
| `migrate <lock-id> <new-pack-version>` | 迁移 Lock 到新 Pack 版本 |
| `outdated` | 检测过期 Lock（Pack 版本变化后需重新协商） |

## 示例 (Examples)

Example 1 — List all locks:
```bash
synapse lock list
```

Example 2 — Show lock details:
```bash
synapse lock show chat_deepseek_v1.0.0
```

Example 3 — Check for outdated locks:
```bash
synapse lock outdated
```

Example 4 — Migrate a lock:
```bash
synapse lock migrate chat_deepseek_v1.0.0 deepseek-v3
```

## 相关命令 (Related Commands)

- [synapse lock outdated](/docs/cli/lock) — 检测需要重新协商的 Lock
- [synapse pack](/docs/cli/pack) — 管理 Provider Pack
