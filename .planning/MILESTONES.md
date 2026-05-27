# Milestones

## v5.0 交互式协商与体验优化 (Shipped: 2026-05-27)

**Phases completed:** 4 phases, 12 plans

**Key accomplishments:**

- CLI 命令基础设施提取：negotiate() 独立命令、共享 prompts/tty utils、全局 flags
- 交互式协商全流程：intent 选择 → Schema 预览 → 字段开关 → Lock diff → 后处理菜单
- 命令精简：--help 3 组输出、smoke→connect --smoke、init→setup、profile/export/import→config
- 命令帮助文本集中化到 utils/help.ts，与文档站点共享
- Playground SDK 自动预览（1s debounce）
- 3 个内置 Schema 预设（Chat/Text-to-Image/Embedding）+ localStorage 自定义
- 费用预估显示
- 用户旅程文档（中英文）
- CLI 命令参考同步更新

---

## v4.0 Documentation & Playground (Shipped: 2026-05-27)

**Phases completed:** 4 phases, 9 plans

**Key accomplishments:**

- Docusaurus 文档站点脚手架 + pnpm workspace 集成 + 构建隔离
- Vite proxy 修复 + GitHub Actions 自动部署工作流
- 入门指南（Overview + 安装 + 首次 connect）
- CLI 命令参考页面覆盖全部命令和参数说明
- Playground 响应式布局（3 档断点）+ 可折叠侧栏
- Provider 密钥状态指示 + 禁用按钮 tooltip + 键盘快捷键
- Add Pack 交互式对话框
- `synapse negotiate` 接入实际 negotiator 协商管道

---

## v1.0 Negotiator Reliability (Shipped: 2026-05-07)

**Phases completed:** 1 phase, 4 plans, 11 tasks

**Key accomplishments:**

- 零外部依赖的进程内 HTTP Mock Server，Schema 驱动的假数据生成，请求体字段验证
- ManifestConstraint 约束定义 + `matchManifest` 三种差异检测 (missing/extra/type_mismatch)
- `negotiateAndVerify()` 全链路 pipeline 编排 + `retryWithFeedback` 最多 2 次结构化重试
- Fire-and-forget Registry 验证提交 + `~/.synapse/verifications/` 本地缓存 + Remote manifest 增强加载

**Known deferred items at close:** 5 (see ROADMAP.md 延迟项)

---
