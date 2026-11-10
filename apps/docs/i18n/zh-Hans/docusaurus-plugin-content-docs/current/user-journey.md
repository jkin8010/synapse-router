---
sidebar_position: 5
title: 用户旅程指南
---

# 用户旅程指南 (User Journey Guide)

本指南介绍使用 Synapse Router 的完整开发者工作流——从安装到生产环境 SDK 集成。

## 第 1 阶段：安装与设置 (Installation and Setup)

第一步是安装 Synapse CLI 并配置您的第一个 Provider。

### 安装 CLI

```bash
npm install -g @synapse-router/cli
```

验证安装：

```bash
synapse --version
```

### 首次设置

运行交互式设置向导来配置您的第一个 Provider：

```bash
synapse setup
```

向导引导您完成：
1. 选择 Provider（DeepSeek、OpenAI、Moonshot 等）
2. 输入 API Key（隐藏输入）
3. 配置基础 URL（提供合理默认值）
4. 选择 Pack 以实现 Schema 兼容

### 备选：手动配置

如果您更倾向于手动配置，可直接存储 API Key：

```bash
synapse vault set deepseek sk-xxx --base-url https://api.deepseek.com/v1
```

验证 Key 已存储：

```bash
synapse vault list
```

> **下一步：** [第 2 阶段：Schema 协商](#第-2-阶段schema-协商-schema-negotiation)

---

## 第 2 阶段：Schema 协商 (Schema Negotiation)

配置好 Provider 后，下一步是 Schema 协商——将您的 Agent Intent 与 Provider 的能力匹配，并创建 Schema Lock。

### 交互式协商

运行不带参数的 `synapse negotiate` 以启动完整的交互式流程：

```bash
synapse negotiate
```

这将启动一个 8 步向导：
1. **选择 Intent**——从所有可用的 intent 中选择（chat、text-to-image 等）
2. **选择 Provider**——从支持所选 intent 的 Provider 中挑选
3. **查看 Schema**——查看带有颜色编码的必填和可选字段
4. **选择字段**——包含或排除可选字段
5. **LLM Key 检查**——配置 LLM API Key 用于 AI 辅助协商，或使用确定性存根
6. **Lock Diff 预览**——保存前与现有 Lock 进行比较
7. **确认保存**——将 Schema Lock 持久化到 `~/.synapse/schemas/`
8. **协商后菜单**——选择下一步操作（测试连接、生成 SDK 等）

### 非交互式协商

适用于脚本和 CI 环境：

```bash
synapse negotiate --intent chat --provider deepseek
```

在[协商命令文档](/docs/cli/negotiate)中了解更多选项。

> **下一步：** [第 3 阶段：测试连接](#第-3-阶段测试连接-test-connection)

---

## 第 3 阶段：测试连接 (Test Connection)

协商之后，在生成 SDK 前先测试连接是否正常。

### 基础连接测试

```bash
synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"你好"}]}'
```

如果不存在缓存的 Schema Lock，协商会自动运行（隐式协商）。

### Smoke 测试

使用 `--smoke` 标志对生产 API 运行 Provider smoke 测试：

```bash
synapse connect --smoke --provider openai
```

### 带计费的连接

如果已配置计费，可自动包装调用以追踪成本：

```bash
synapse connect deepseek chat --input '{"messages":[]}' --billing preCall
```

在[连接命令文档](/docs/cli/connect)中了解更多。

> **下一步：** [第 4 阶段：SDK 生成](#第-4-阶段sdk-生成-sdk-generation)

---

## 第 4 阶段：SDK 生成 (SDK Generation)

协商和连接验证通过后，生成零依赖的 SDK。

### 生成 SDK

```bash
synapse sdk generate --pack openai --lang typescript --output ./synapse-sdk
```

这将读取指定的 Provider Pack 并生成 TypeScript SDK 代码到输出目录。

### 选项

```bash
# 包含计费追踪
synapse sdk generate --pack openai --lang typescript --output ./synapse-sdk --with-billing

# 包含生产 Profile 数据
synapse sdk generate --pack openai --lang python --output ./synapse-sdk

# 根据 Profile 数据调优策略权重
synapse sdk generate --pack openai --lang typescript --provider deepseek \
  --base-url https://api.deepseek.com/v1 --output ./synapse-sdk

# 指定输出目录
# 每次针对一个 Pack 生成；遍历 Pack 即可覆盖所有 Provider

# 仅生成单个 Provider 的 SDK

```

### SDK 输出结构

```
synapse-sdk/
├── deepseek/
│   ├── index.ts           # 导出 client + types
│   ├── client.ts          # HTTP client（零依赖）
│   ├── types.ts           # 类型定义
│   └── README.md
├── openai/
│   └── ...
├── genesis.json           # Profile 元数据（配合 --with-profile）
├── synapse.json           # 生成元数据
└── tsconfig.json
```

生成的 SDK **零依赖**——仅使用内置 `fetch`，无运行时 Router 或 LLM 依赖。所有协商、路由和 Provider 选择决策在开发时已完成。

> **下一步：** [第 5 阶段：生产集成](#第-5-阶段生产集成-production-integration)

---

## 第 5 阶段：生产集成 (Production Integration)

将生成的 SDK 集成到您的应用程序中。

### 导入和使用

```typescript
import { DeepSeekSDK } from "./synapse-sdk/deepseek";

const client = new DeepSeekSDK();
const output = await client.chat({
  messages: [{ role: "user", content: "Hello" }],
});

console.log(output);
```

### 日志收集

在生产环境中运行时，SDK 会自动将事件记录到 `.synapse/watchdog/events.ndjson`。这些事件捕获了：
- 请求/响应元数据
- 延迟和成功率
- 错误模式

### 数据同步

导出生产数据供开发分析：

```bash
# 在生产环境
synapse config export --stdout | ssh dev "synapse config import --stdin --merge"
```

监控生产事件：

```bash
synapse watchdog
```

在 [SDK 使用指南](/docs/sdk) 中了解更多关于生产工作流的信息。

> **下一步：** [第 6 阶段：持续改进](#第-6-阶段持续改进-continuous-improvement)

---

## 第 6 阶段：持续改进 (Continuous Improvement)

Synapse Router 工作流专为持续反馈循环设计。生产数据回流到开发环境以改善 SDK 质量。

### Profile 数据循环

1. **生产环境** 生成事件 -> `.synapse/watchdog/events.ndjson`
2. **刷新 Profile** -> `synapse config profile refresh` 聚合事件
3. **导出** -> `synapse config export` 打包 `.synapse/` 为 tar.gz
4. **导入** -> `synapse config import` 在开发环境恢复数据
5. **重新生成** -> `synapse sdk generate --pack <id> --lang <lang> --output <dir>` 用更新后的 Pack 重新生成 SDK

### Lock 健康检查

检查过期的 Schema Lock：

```bash
synapse lock outdated
```

当 Provider Pack 更新时，迁移现有 Lock：

```bash
synapse lock migrate chat_openai_v1.0.0_abc12345
```

### Pack 更新

在 Registry 中检查更新的 Pack 版本：

```bash
synapse pack check
synapse pack update openai
```

### 迭代周期

推荐的使用 Synapse Router 的团队迭代周期：

```
第 1 周： 安装 -> 设置 -> 协商 -> 连接 -> 生成 -> 部署
第 2 周： 收集生产日志 -> 导出 -> 导入 -> 使用 Profile 生成 -> 部署 v2
第 4 周： 检查 Lock 健康 -> 更新 Pack -> 重新协商 -> 生成 v3
每月：   Profile 驱动调优 -> 策略调整 -> 完整管道
```

## 完整工作流总结

```
安装 -> 设置 -> 协商 -> 连接 -> 生成 -> 部署
                                    |
        持续改进 <- 收集 Profile <- 收集日志
                        |
            重新协商 -> 重新生成 -> 重新部署
```

相关文档：
- [CLI 命令参考](/docs/cli)
- [synapse negotiate](/docs/cli/negotiate)
- [synapse connect](/docs/cli/connect)
- [SDK 使用指南](/docs/sdk)
- [synapse lock](/docs/cli/lock)
- [synapse pack](/docs/cli/pack)
- [synapse config](/docs/cli/config)
