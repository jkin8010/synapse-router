# Phase 12: Install CLI + 自动化分发 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-19
**Phase:** 12-install-cli-automation
**Areas discussed:** 包架构, 环境检测 + 安装路径, CI/CD 发布策略, 卸载与回滚

---

## 包架构

| Option | Description | Selected |
|--------|-------------|----------|
| 独立包 npx @synapse-router/install-skill (推荐) | 新包 packages/install-skill/，独立 node CLI，零依赖策略 | ✓ |
| 扩展 CLI 子命令 | 扩展现有 apps/cli/，添加 synapse install-skill 子命令 | |
| 合并到 skill 包 | 在 packages/skill/ 添加 bin 入口 | |

**User's choice:** 独立包 npx @synapse-router/install-skill

**Sub-questions:**

| Option | Description | Selected |
|--------|-------------|----------|
| install-skill (推荐) | 标准模式，npx @synapse-router/install-skill 即可运行 | ✓ |
| synapse-install-skill | 项目命名一致性 | |

User's choice: install-skill

| Option | Description | Selected |
|--------|-------------|----------|
| 零依赖 (推荐) | 只使用 Node.js 内置模块 | ✓ |
| 最小依赖 | 引入 chalk/commander | |

User's choice: 零依赖

| Option | Description | Selected |
|--------|-------------|----------|
| 全部长标志 (推荐) | --dry-run, --platform, --dir, --uninstall | ✓ |
| 长短标志均有 | 兼顾效率 | |

User's choice: 全部长标志

---

## 环境检测 + 安装路径

| Option | Description | Selected |
|--------|-------------|----------|
| 从当前目录检测 (推荐) | 从工作目录向上查找平台标记文件 | ✓ |
| 检测用户主目录 | 检查 ~/.config 等 | |
| 混合检测 | 同时检查 | |

**User's choice:** 从当前目录检测

**Sub-questions:**

| Option | Description | Selected |
|--------|-------------|----------|
| 第一个匹配即停 (推荐) | 找到第一个平台就安装并停止 | ✓ |
| 列出所有匹配平台 | 提示用户选择或全部安装 | |

User's choice: 第一个匹配即停

| Option | Description | Selected |
|--------|-------------|----------|
| Claude Code > Cursor > Codex > OpenClaw > Hermes | CLI/CLAUDE.md 最常用 | ✓ |
| Cursor > Claude Code > 其他 | Cursor 更广泛 | |
| 按字母顺序 | 无偏好 | |

User's choice: Claude Code > Cursor > Codex > OpenClaw > Hermes

**安装路径映射：**

| 平台 | 安装路径 | 选择 |
|------|---------|------|
| Claude Code | .claude/skills/synapse-router/ | ✓ |
| Cursor | .cursor/rules/synapse-router.mdc | ✓ |
| Codex | ~/.codex/agents/synapse-router.yaml | ✓ |
| OpenClaw | ~/.openclaw/agents/synapse-router.md | ✓ |
| Hermes | ~/.hermes/agents/synapse-router.md | ✓ |

---

## CI/CD 发布策略

| Option | Description | Selected |
|--------|-------------|----------|
| tag push (v*) 触发 (推荐) | 推送 git tag 时自动构建发布 | ✓ |
| Release 创建触发 | 需手动创建 Release | |
| main 分支 push 触发 | 常规发布节奏 | |

**User's choice:** tag push (v*) 触发

**Sub-questions:**

| Option | Description | Selected |
|--------|-------------|----------|
| @synapse-router/skill + @synapse-router/install-skill (推荐) | 同时发布两个包 | ✓ |
| 仅 @synapse-router/install-skill | 只发 install-skill | |

User's choice: 同时发布两个包

| Option | Description | Selected |
|--------|-------------|----------|
| 从 git tag 自动派生 (推荐) | 标签自动提取版本 | ✓ |
| 手动维护版本号 | 手动版 package.json | |

User's choice: 从 git tag 自动派生

| Option | Description | Selected |
|--------|-------------|----------|
| NPM_TOKEN GitHub Secrets (推荐) | 标准 npm token | ✓ |
| GitHub Packages | GitHub registry | |
| npm + GitHub Packages | 两个 registry | |

User's choice: NPM_TOKEN GitHub Secrets

| Option | Description | Selected |
|--------|-------------|----------|
| 构建验证 + 测试 (推荐) | pnpm build + pnpm test | ✓ |
| 仅构建验证 | 只 build | |

User's choice: 构建验证 + 测试

---

## 卸载与回滚

| Option | Description | Selected |
|--------|-------------|----------|
| 安装清单 (manifest) 模式 (推荐) | 在 .synapse/install-manifest.json 记录安装文件列表 | ✓ |
| 扫描模式 | 运行扫描标准安装路径 | |

**User's choice:** 安装清单 (manifest) 模式

**Sub-questions:**

| Option | Description | Selected |
|--------|-------------|----------|
| 安装前备份原文件 (推荐) | 备份到 .synapse/install-backups/ | ✓ |
| 不备份，只删除 | 不备份 | |

User's choice: 安装前备份原文件

| Option | Description | Selected |
|--------|-------------|----------|
| 清理文件，保留父目录 (推荐) | 只清理写入的文件 | ✓ |
| 完全清理所有目录 | 删除所有相关目录 | |

User's choice: 清理文件，保留父目录

---

## Claude's Discretion
- 检测信号文件路径和优先级判断逻辑的具体实现
- 安装进度输出格式
- GitHub Actions workflow 文件名和步骤命名
- --dry-run 输出格式

## Deferred Ideas
- 多语言 skill 支持
- Skill 版本更新检测
- GUI skill 管理界面
