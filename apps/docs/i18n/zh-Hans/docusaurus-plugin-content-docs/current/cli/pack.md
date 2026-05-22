---
sidebar_position: 6
title: synapse pack
---

# synapse pack — 管理 Provider Pack

pack 命令管理 Provider Pack 的安装、搜索、更新和删除。每个 Provider Pack 是一个目录，包含 `provider-card.json`（Provider 能力声明）和 `dsl/`（Agent Schema DSL 文件）。Pack 可以从本地 Registry 或远程 Registry 安装。

## 子命令 (Subcommands)

| 子命令 | 说明 |
|--------|------|
| `add <pack-id>` | 从 Registry 安装 Pack |
| `search <query>` | 在 Registry 中搜索 Pack |
| `list [--remote]` | 列出本地或远程 Pack |
| `update <pack-id>` | 更新已安装的 Pack |
| `remove <pack-id>` | 删除已安装的 Pack |
| `show <pack-id>` | 显示 Pack 详情 |

## 示例 (Examples)

Example 1 — Search for a provider pack:
```bash
synapse pack search deepseek
```

Example 2 — Install a pack:
```bash
synapse pack add deepseek-v3
```

Example 3 — List local packs:
```bash
synapse pack list
```

Example 4 — Show pack details:
```bash
synapse pack show deepseek-v3
```

Example 5 — Update an installed pack:
```bash
synapse pack update deepseek-v3
```

Example 6 — Remove a pack:
```bash
synapse pack remove deepseek-v3
```

## 相关命令 (Related Commands)

- [synapse lock](/docs/cli/lock) — 管理 Pack 关联的 Schema Lock
- [Pack Development Guide](/docs/packs) — Provider Pack 开发指南
