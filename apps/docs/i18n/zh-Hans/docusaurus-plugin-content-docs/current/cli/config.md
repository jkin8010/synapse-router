---
sidebar_position: 8
title: synapse config
---

# synapse config — 配置管理

config 命令管理 Synapse Router 的全局配置（Global Configuration）。支持点号记法（Dot Notation）访问嵌套配置项，如 `billing.strategy`、`route.strategies.xxx`。配置持久化到 `~/.synapse/config.json`。

## 命名空间 (Namespace)

| 命名空间 | 说明 |
|----------|------|
| `billing.*` | 计费配置（策略、限额、Provider、降级策略） |
| `route.*` | 路由配置（默认策略、自定义策略权重、偏好设置） |

## 子命令 (Subcommands)

| 子命令 | 说明 |
|--------|------|
| `set <key> <value>` | 设置配置值，支持点号记法 |
| `get <key>` | 获取配置值 |
| `list` | 列出所有配置 |

## 示例 (Examples)

Example 1 — Set billing strategy:
```bash
synapse config set billing.strategy perToken
```

Example 2 — Get a config value:
```bash
synapse config get billing.strategy
# perToken
```

Example 3 — List all configuration:
```bash
synapse config list
```

Example 4 — Set custom route strategy:
```bash
synapse config set route.strategies.my-custom '{"cost":3,"latency":2,"reliability":2,"featureMatch":2,"preference":1}'
```

## 相关命令 (Related Commands)

- [synapse billing config](/docs/cli/billing) — billing 配置的快捷入口
- [synapse setup](/docs/cli/setup) — 交互式初始化向导（自动设置基础配置）
