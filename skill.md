# Synapse Router Skill

面向 AI Agent 的受控 Schema 协商与多 Provider 路由层。

> 此文件是 Synapse Router Skill 的入口。完整内容见 [CLAUDE.md](./CLAUDE.md)。

## 快速开始

安装 skill:

- Claude Code: 项目根目录 CLAUDE.md 自动加载
- Cursor: 复制 `skills/cursor/.cursorrules` 到项目根
- Codex: 配置 `skills/codex/agent.yaml`
- OpenClaw / Hermes: 参考 `skills/openclaw/agent.md` / `skills/hermes/agent.md`

npm 安装: `npm install @synapse-router/skill`

GitHub raw URL 安装: `skills add https://raw.githubusercontent.com/useeclaw/synapse-router/main/skill.md`

## 核心能力

1. **Schema 协商**: 匹配 Agent Intent 到 Provider Feature，验证能力契约
2. **Provider 路由**: 五维评分选择最优 Provider
3. **SDK 生成**: `synapse evolve` 生成零依赖 TypeScript/Python SDK
4. **Billing 集成**: 配额管理、定价策略、自动包裹
5. **加密密钥管理**: AES-256-GCM 加密存储

## 命令速查

| 命令                                  | 用途                   |
| ------------------------------------- | ---------------------- |
| `synapse connect <provider> <intent>` | 连接 Provider 执行功能 |
| `synapse evolve`                      | 生成零依赖 SDK         |
| `synapse route <intent>`              | 多维评分路由           |
| `synapse billing init`                | 初始化计费配置         |
| `synapse billing status`              | 查看配额和费用概览     |
| `synapse vault set <provider> <key>`  | 存储加密 API Key       |
| `synapse lock list`                   | 查看 Schema Lock 列表  |

完整命令参考: [CLAUDE.md](./CLAUDE.md#synapse-cli)

## 架构原则

- **开发时协商，运行时无感**: 复杂逻辑在开发时完成，运行时只有纯代码 SDK
- **SDK 零依赖**: 生成的 SDK 不依赖 @synapse-router/\*
- **无运行时 LLM**: 运行时路径零 Token 成本
- **Provider 可替换不等价**: Adapter 诚实暴露能力，Router 按契约匹配

## 平台适配

| 平台        | Skill 文件                 |
| ----------- | -------------------------- |
| Claude Code | CLAUDE.md (项目根)         |
| Cursor      | skills/cursor/.cursorrules |
| Codex       | skills/codex/agent.yaml    |
| OpenClaw    | skills/openclaw/agent.md   |
| Hermes      | skills/hermes/agent.md     |

## 更多信息

- 项目仓库: https://github.com/useeclaw/synapse-router
- 文档: docs/API.md, docs/PACKS.md
