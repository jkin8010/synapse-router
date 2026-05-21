---
sidebar_position: 4
title: synapse evolve
---

# synapse evolve — 生成零依赖 SDK

evolve 命令将 Schema Lock 转换为零依赖（Zero-Dependency）的纯函数 SDK 代码。这是 Synapse Router 的核心命令，体现了"开发时协商，运行时无感"的架构原则。生成的 SDK 只使用内置 `fetch`，不依赖任何 `@synapse-router/*` 包。

## 参数 (Parameters)

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--output <dir>` | string | 否 | `./synapse-sdk` | SDK 输出目录 |
| `--tune` | flag | 否 | false | 重新协商（Re-negotiate）所有 Schema Lock |
| `--with-billing` | flag | 否 | false | 在生成的 SDK 中包含 BillingTracker 用量追踪类 |

## 工作流程 (Workflow)

evolve 命令的处理流程包含四个步骤：

1. **读取 Provider Pack** — 从 `packs/`、Registry 和本地目录加载所有 Provider Pack
2. **协商 Schema Lock** — 对每个 Provider 的 Feature 执行协商，创建或更新 Schema Lock
3. **生成代码** — 根据 Schema Lock 中的字段映射（Field Mapping）生成 TypeScript / Python SDK 代码
4. **输出** — 写入 `--output` 目录（默认 `./synapse-sdk`），零外部依赖

## 示例 (Examples)

### Example 1 — Basic generation

```bash
synapse evolve
# Generates ./synapse-sdk/ with TypeScript SDK
```

### Example 2 — With billing tracking

```bash
synapse evolve --with-billing
# SDK includes BillingTracker class for quota tracking
```

### Example 3 — Custom output + re-negotiate

```bash
synapse evolve --output ./my-sdk --tune
# Outputs to ./my-sdk, forces re-negotiation of all locks
```

### Example 4 — Full featured generation

```bash
synapse evolve --output ./production-sdk --with-billing --tune
# Custom output, billing included, all locks refreshed
```

## 相关命令 (Related Commands)

- [/docs/cli/lock](/docs/cli/lock) — 查看现有 Schema Lock
- [/docs/cli/pack](/docs/cli/pack) — 查看已安装的 Provider Pack
- [/docs/sdk](/docs/sdk) — SDK 使用详细指南
