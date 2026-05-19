---
phase: 12-install-cli-automation
milestone: v3.0
generated: 2026-05-19
previous_phase: 11-skill-package-content-coverage
status: decisions_complete
decisions_captured: 6
---

# Phase 12 -- Install CLI + 自动化分发: Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 12 创建 `@synapse-router/install-skill` CLI 工具，实现一条 npx 命令安装 Synapse Router Skill 到任何 AI Agent 平台。同时创建 GitHub Actions CI/CD 工作流，在 tag 推送时自动构建并发布 skill 包到 npm。

**In scope:**
- `packages/install-skill/` 独立 npm 包（零依赖，纯 node:fs / node:path）
- `npx @synapse-router/install-skill` 一键安装命令
- 自动检测当前 AI Agent 环境（Claude Code > Cursor > Codex > OpenClaw > Hermes）
- `--platform` 手动指定平台，`--dir` 自定义安装路径
- `--dry-run` 预览安装计划，`--uninstall` 卸载清理
- GitHub Actions CI/CD（tag push v* 触发，NPM_TOKEN，自动版本派生）
- 发布 `@synapse-router/skill` 和 `@synapse-router/install-skill` 两个包

**Not in scope:**
- 多语言 skill 支持（延迟）
- Skill 版本更新检测（延迟）
- GUI skill 管理界面（延迟）
- Provider packs pricing 数据补充（延迟）

</domain>

<decisions>
## Implementation Decisions

### 包架构
- **D-01: 独立包发布** -- `@synapse-router/install-skill` 作为独立 npm 包，不扩展现有 CLI
  - 用户直接 `npx @synapse-router/install-skill` 运行
  - 零外部依赖，只使用 Node.js 内置模块（fs, path, os）
  - bin 入口名称: `install-skill`
  - CLI 参数全部使用长标志（`--dry-run`, `--platform`, `--dir`, `--uninstall`）

### 环境检测
- **D-02: 从当前目录检测** -- 从工作目录开始向上查找各平台的标记文件，找到即止
  - 不检查用户主目录，不混合检测
  - 找到第一个匹配平台立即安装并停止

### 平台优先级与安装路径
- **D-03: 检测优先级 & 安装路径映射**

  | 优先级 | 平台 | 检测信号 | 安装路径 |
  |--------|------|---------|---------|
  | 1 | Claude Code | `.claude/` 或 CLAUDE.md | `.claude/skills/synapse-router/` |
  | 2 | Cursor | `.cursor/` 或 `.cursorrules` | `.cursor/rules/synapse-router.mdc` |
  | 3 | Codex | `~/.codex/` | `~/.codex/agents/synapse-router.yaml` |
  | 4 | OpenClaw | `~/.openclaw/` | `~/.openclaw/agents/synapse-router.md` |
  | 5 | Hermes | `~/.hermes/` | `~/.hermes/agents/synapse-router.md` |

  - Codex/OpenClaw/Hermes 安装在用户主目录，Claude Code/Cursor 安装在项目本地目录

### CI/CD 自动化
- **D-04: GitHub Actions 发布策略**
  - 触发条件: tag push (v* 格式)
  - 发布目标: npm registry（NPM_TOKEN GitHub Secrets 认证）
  - 发布包: `@synapse-router/skill` + `@synapse-router/install-skill`
  - 版本号: 从 git tag 自动派生
  - 前置步骤: pnpm build + pnpm test 通过后才发布

### 卸载与回滚
- **D-05: 安装清单模式** -- 安装时在 `.synapse/install-manifest.json` 记录已安装的文件列表和路径
  - 卸载时读取清单精确删除
  - 避免扫描模式的不可靠性
- **D-06: 备份 + 清理**
  - 安装前检查目标位置是否有同名文件，如有则先备份到 `.synapse/install-backups/`
  - 卸载时可选择恢复备份
  - 卸载只清理 install-skill 写入的文件，保留父目录

### Claude's Discretion
- 具体检测信号文件路径和优先级判断逻辑
- 安装进度输出格式
- GitHub Actions workflow 文件名和步骤命名
- `--dry-run` 输出格式（结构化）

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 包模板参考
- `packages/skill/package.json` -- 已有 npm 包结构模板（files, scripts, exports 模式）
- `apps/cli/package.json` -- CLI 包 bin 注册模式（`"bin": {"synapse": "./dist/index.js"}`）
- `apps/cli/src/index.ts` -- CLI 参数解析模式（`parseArgs`, 命令分发结构）

### Skill 平台文件参考
- `packages/skill/skills/claude-code/skill.md` -- 需安装到 `.claude/skills/synapse-router/` 的文件
- `packages/skill/skills/cursor/` -- 需安装到 `.cursor/rules/synapse-router.mdc` 的文件
- `packages/skill/skills/codex/agent.yaml` -- 需安装到 `~/.codex/agents/synapse-router.yaml` 的文件
- `packages/skill/skills/openclaw/agent.md` -- 需安装到 `~/.openclaw/agents/synapse-router.md` 的文件
- `packages/skill/skills/hermes/agent.md` -- 需安装到 `~/.hermes/agents/synapse-router.md` 的文件

### 需求文档
- `.planning/REQUIREMENTS.md` §SKILLINSTALL-01 至 SKILLINSTALL-04, SKILLGIT-03 -- 需求定义
- `.planning/ROADMAP.md` §Phase 12 -- 阶段目标与成功标准

### 前期决策
- `.planning/phases/11-skill-package-content-coverage/11-CONTEXT.md` -- Phase 11 上下文（D-01 至 D-04）

### Monorepo 模式
- `pnpm-workspace.yaml` -- workspace 配置
- `tsconfig.json` -- 根 TypeScript 配置

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/skill/package.json` -- 技能包模板（files 字段含 skills/ 目录、exports 配置、devDependencies 模式）
- `packages/skill/skills/` -- 5 平台 skill 文件（可直接复制到安装目标路径）
- `apps/cli/src/index.ts` -- CLI 参数解析模式（parseArgs + 命令分发，可借鉴）
- `.github/` -- 目录已存在但无 workflows，可创建 `.github/workflows/publish.yml`

### Established Patterns
- 包命名: `@synapse-router/<name>`
- Monorepo 包: 独立 tsconfig.json，独立编译
- CLI 工具: bin 入口 + shebang + 零外部依赖（install-skill 也应遵循）
- 构建: tsc -p tsconfig.json

### Integration Points
- `.claude/skills/synapse-router/` -- 新目录（需创建）
- `.cursor/rules/synapse-router.mdc` -- 新文件
- `~/.codex/agents/` -- 可能存在，需要检查
- `~/.openclaw/agents/` -- 可能存在，需要检查
- `~/.hermes/agents/` -- 可能存在，需要检查
- `.synapse/install-manifest.json` -- 新清单文件
- `.synapse/install-backups/` -- 新备份目录

</code_context>

<specifics>
## Specific Ideas

- install-skill 应类似 create-next-app 的使用体验 —— 一行 npx 命令完成全部操作
- --dry-run 应该像 pnpm/npm 的 dry-run 一样清晰显示"将要做什么"而不是"能做什么"
- 卸载时优先读取 manifest，manifest 丢失时才 fallback 到扫描模式
- CI/CD 工作流应包含 changelog/github release 自动生成以方便用户查看更新

</specifics>

<deferred>
## Deferred Ideas

### 后续阶段
- 多语言 skill 支持（中英文）
- Skill 版本更新检测和自动更新
- GUI skill 管理界面
- Marketplace/Registry 集成

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 12-install-cli-automation*
*Context gathered: 2026-05-19*
