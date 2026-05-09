# Playground UI 规范

> Synapse Router 本地可视化调试界面 — 面向开发者的 Schema 协商与 Provider 路由测试工具。

**版本**: 0.1.0 | **最后更新**: 2026-05-08
**状态**: 设计确认，待实施

---

## 1. 目标与用户

### 1.1 Playground 要解决的问题

开发者使用 Synapse Router 时，需要一种方式来：

- 可视化编辑和调试 Agent Schema（而非手写 JSON / CLI curl）
- 在不同 Provider 之间切换，观察协商结果差异
- 查看 Provider 返回的原始与标准化响应
- 在同一个界面完成 "编辑 Schema → 协商 → 执行 → 看结果" 的闭环
- 快速验证 Provider Pack 是否正确工作

Playground 不取代 API Server、CLI 或 MCP Server。它是一个开发期辅助工具，面向 Synapse Router 的集成开发者与 Pack 维护者。

### 1.2 目标用户

| 用户 | 使用场景 | 核心需求 |
|------|----------|----------|
| Pack 开发者 | 编写或调试 Provider Pack | 快速测试协商匹配，观察字段映射结果 |
| Agent 集成者 | 配置 Agent Schema 并验证路由 | 编辑 Schema，对比多个 Provider 的协商差异 |
| Synapse Router 贡献者 | 调试 Router 核心流程 | 查看完整协商链路和执行结果 |

### 1.3 非目标

- 不做 API Server 的图形化替代（Playground 直连本地 Router 库）
- 不做生产监控面板
- 不承担 API Key 管理（Key 管理由 vault 模块处理）

---

## 2. 技术选型与决策记录

### 2.1 确认的决策

| # | 决策项 | 选择 | 理由 |
|---|--------|------|------|
| 1 | 框架 | React 19 + Vite 6 | 快速迭代、HMR 友好、生态成熟 |
| 2 | 样式方案 | Tailwind CSS v4 | 零运行时、utility-first、适合单页工具 |
| 3 | 组件库 | **无**（手写 Tailwind 组件） | 单阶段工具不需要组件库的复杂度和依赖 |
| 4 | 对话框 | 原生 `<dialog>` 元素 | 避免引入 dialog/overlay 库，原生语义化 |
| 5 | 代码编辑器 | CodeMirror 6 | JSON Schema 编辑需要语法高亮和折叠 |
| 6 | 面板布局 | 自实现 resizable panels | 三栏布局需要用户自定义宽度，但不需要重型布局库 |
| 7 | 构建工具 | Vite | 开发 HMR + 生产快速构建 |
| 8 | 包管理 | pnpm workspace（复用 monorepo） | 项目已有 pnpm monorepo |

### 2.2 不引入的依赖

| 库/框架 | 替代方案 | 原因 |
|----------|----------|------|
| shadcn/ui | 手写 Tailwind 组件 | 单页面、组件少，手写更可控、无额外依赖 |
| radix-ui / headless-ui | 原生 `<dialog>` + 手写 | 模态框唯一场景是确认和配置，原生已足够 |
| react-resizable-panels | 纯 CSS + 鼠标事件 | 三栏面板，简单拖拽分割不需要全功能库 |
| monaco-editor | CodeMirror 6 | Monaco 包体积过大（>5MB），CM6 轻量（~300KB gzip） |
| axios | 内置 `fetch` | 浏览器原生已支持，无额外依赖收益 |
| react-query / swr | 无 | 调试工具的请求模式简单，不需要缓存/重试框架 |

---

## 3. 布局架构

### 3.1 整体布局

```
┌─────────────────────────────────────────────────────────────────┐
│  ┌──────┬──────────────────────────────────┬──────────────────┐ │
│  │      │                                  │                  │ │
│  │ LEFT │          CENTER                   │      RIGHT       │ │
│  │ PANEL│          PANEL                    │      PANEL       │ │
│  │      │                                  │                  │ │
│  │ Pro- │  Schema Editor (CodeMirror)      │  Response Viewer │ │
│  │ vider│                                  │  (6 tabs)        │ │
│  │ Sel- │  ┌────────────────────────────┐  │                  │ │
│  │ ector│  │  Action Bar                │  │  ┌────────────┐  │ │
│  │      │  │  [Negotiate] [Execute]     │  │  │ TypeScript │  │ │
│  │      │  │  [Mock Test]               │  │  │ Python     │  │ │
│  │      │  └────────────────────────────┘  │  │ Formatted  │  │ │
│  │      │                                  │  │ Raw JSON   │  │ │
│  │      │  Mock Test Results (inline)      │  │ Logs       │  │ │
│  │      │                                  │  │ Errors     │  │ │
│  │      │                                  │  │            │  │ │
│  └──────┴──────────────────────────────────┴──────────────────┘ │
│                                                                  │
│  Status Bar (协商状态 / 执行时间 / 所选 Provider 摘要)           │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 三栏布局行为

- LEFT PANEL: 固定最小宽度 200px，最大宽度 400px，默认 240px
- CENTER PANEL: 弹性宽度，占剩余空间，最小 400px
- RIGHT PANEL: 固定最小宽度 280px，最大宽度 500px，默认 320px

分割线行为：
- 分割线宽度 4px，hover 时高亮（`bg-blue-500/30`）
- 鼠标拖拽改变左右面板宽度
- 拖拽时 cursor `col-resize`
- 面板宽度通过 CSS `grid-template-columns` 控制，拖拽更新 grid 值
- 拖拽结束时无动画，即时更新

### 3.3 响应式

Playground 面向 1440px+ 桌面显示器。以下情况做降级：

| 视口宽度 | 布局调整 |
|-----------|----------|
| >1440px | 三栏完整布局 |
| 1024-1440px | LEFT PANEL 折叠为可展开侧边栏（图标按钮触发） |
| <1024px | 面板堆叠为上下结构，通过标签页切换 |

---

## 4. 组件规范 — 通用

### 4.1 设计系统（基于 Tailwind）

不使用组件库，所有组件直接在 JSX 中通过 Tailwind utility classes 构造。以下为约定：

**颜色 token（Tailwind 默认色板）:**

| Token | Tailwind Class | 用途 |
|-------|---------------|------|
| 背景（主） | `bg-gray-950` | 主面板背景 |
| 背景（辅） | `bg-gray-900` | 面板头/状态栏/分割线区域 |
| 背景（卡片） | `bg-gray-850` (custom: `#1a1d24`) | Provider 卡片、信息区块 |
| 边框 | `border-gray-700/50` | 面板边框、分割线 |
| 文字（主） | `text-gray-100` | 主要内容 |
| 文字（辅） | `text-gray-400` | 次要信息、标题 |
| 文字（禁用） | `text-gray-600` | 禁用状态文本 |
| 强调色 | `text-blue-400` / `bg-blue-500` | 选中、激活、链接 |
| 成功 | `text-green-400` / `bg-green-500` | 协商成功、执行成功 |
| 警告 | `text-yellow-400` / `bg-yellow-500` | 降级匹配、部分成功 |
| 错误 | `text-red-400` / `bg-red-500` | 协商失败、执行错误 |

**排版:**

| 层级 | Tailwind Class | 用途 |
|------|---------------|------|
| 面板标题 | `text-xs font-semibold text-gray-400 uppercase tracking-wider` | 每个面板的标题栏 |
| 正文 | `text-sm text-gray-100` | 大多数文字内容 |
| 小字 | `text-xs text-gray-400` | 辅助信息、时间戳 |
| 代码 | `font-mono text-sm` | 代码、JSON、字段名 |
| 按钮文字 | `text-sm font-medium` | 按钮标签 |

**间距:**

- 面板内部 padding: `p-4`
- 面板间 gap: `gap-0`（由分割线分隔）
- 卡片间 gap: `space-y-2`
- 元素间 gap: `gap-2` / `gap-3`
- 面板头与内容间距: `mb-3`

**圆角:**

| 层级 | Tailwind Class | 用途 |
|------|---------------|------|
| 按钮/标签 | `rounded-md` (6px) | 按钮、徽章 |
| 卡片/区块 | `rounded-lg` (8px) | Provider 卡片、代码区块 |
| 面板 | `rounded-none` | 面板自身无圆角 |

### 4.2 动效约定

- hover/active 状态: `transition-colors duration-150`
- 面板展开/折叠: `transition-all duration-200`
- 状态指示闪烁: `transition-opacity duration-300`
- 无复杂动画（工具属性 > 视觉华丽）

### 4.3 对话框（原生 `<dialog>`）

所有模态对话框使用 HTML5 原生 `<dialog>` 元素，搭配 `::backdrop` 伪元素做遮罩。

通用对话框样式：

```tsx
<dialog className="
  fixed inset-0 z-50 m-auto
  bg-gray-900 border border-gray-700 rounded-lg
  text-gray-100
  open:flex flex-col
  backdrop:bg-black/60
  min-w-[400px] max-w-[600px]
  p-0
">
  {/* 标题栏: p-4 border-b border-gray-700 */}
  {/* 内容区: p-4 */}
  {/* 操作栏: p-4 border-t border-gray-700 flex justify-end gap-2 */}
</dialog>
```

不使用 `open` attribute 控制显示，使用 `.showModal()` / `.close()` 方法。

---

## 5. 组件规范 — 各面板

### 5.1 LEFT PANEL: Provider Selector

卡风格选择器，展示可用的 Provider Pack，供用户选取协商目标。

**布局:**

```
┌────────────────────────────────┐
│ PROVIDERS             [+ Add] │  ← 面板标题 + 操作按钮
├────────────────────────────────┤
│ ┌────────────────────────────┐ │
│ │ ● OpenAI                   │ │  ← 选中状态（蓝色指示点 + 蓝色边框）
│ │ gpt-4o, dall-e-3, ...      │ │  ← 能力标签行
│ │ 4 features                 │ │  ← 能力计数
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ ○ Replicate                │ │  ← 未选中状态（灰色边框）
│ │ stable-diffusion, ...      │ │
│ │ 2 features                 │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ ○ Stability AI             │ │
│ │ (no key configured)        │ │  ← 未配置 Key 的提示（黄色文字）
│ │ 1 feature                  │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

**卡片状态:**

| 状态 | 视觉 | 交互 |
|------|------|------|
| 未选中 | `bg-gray-850 border-gray-700` | `cursor-pointer`，点击选中 |
| 选中 | `bg-gray-850 border-blue-500 ring-1 ring-blue-500/30` | 蓝色边框+光晕 |
| 禁用（无 Key） | `opacity-60` | `cursor-not-allowed`，点击显示配置 Key 对话框 |
| 加载中 | 骨架屏（`animate-pulse bg-gray-800`） | 不可交互 |
| 空 | "No providers found" 文字提示 | 显示 "How to add a pack" 帮助链接 |

**内容:**

- Provider 名称（左侧圆点指示选中状态）
- 能力标签（pill/badge 样式）：`bg-gray-800 text-gray-300 text-xs rounded-md px-2 py-0.5`
- Feature 数量
- API Key 状态（可选：已配置 / 未配置）

**操作按钮:**

- "Add Pack": 打开 `dialog`，提供 Pack 路径输入或选择文件（原生 `<input type="file">`）
- 刷新按钮：重新扫描 Provider Registry（`text-gray-400 hover:text-gray-100`）

### 5.2 CENTER PANEL: Schema Editor + Action Bar + Mock Section

#### 5.2.1 Schema Editor

使用 CodeMirror 6 的 JSON 编辑器，编辑 Agent Schema。

**布局:**

```
┌──────────────────────────────────────────────────┐
│ SCHEMA EDITOR          [Load] [Save] [Clear]    │  ← 面板标题 + 文件操作
├──────────────────────────────────────────────────┤
│                                                  │
│  CodeMirror 编辑器实例                            │
│  • JSON 语法高亮                                 │
│  • 行号                                           │
│  • 代码折叠                                       │
│  • 最小高度 300px                                 │
│  • 错误行下划线（红色波浪线）                      │
│                                                  │
└──────────────────────────────────────────────────┘
```

**编辑器配置:**

```typescript
import { EditorView, basicSetup } from 'codemirror'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { lintGutter } from '@codemirror/lint'

const editor = new EditorView({
  extensions: [
    basicSetup,
    json(),
    jsonParseLinter(),
    lintGutter(),
    EditorView.theme({
      '&': { backgroundColor: 'transparent', height: '100%' },
      '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: '13px' },
      '.cm-activeLine': { backgroundColor: 'rgba(59, 130, 246, 0.05)' },
      '.cm-cursor': { borderLeftColor: '#60a5fa' },
      '.cm-selectionBackground': { backgroundColor: 'rgba(59, 130, 246, 0.2)' },
    }),
  ],
  parent: container,
})
```

**编辑器内容状态:**

| 状态 | 表现 |
|------|------|
| 空白 | 显示 placeholder: `{ /* 粘贴或编辑 Agent Schema JSON */ }` |
| 有效 JSON | 正常高亮，无 lint 错误 |
| 无效 JSON | 错误行红色下划线，lint gutter 显示错误标记 |
| 加载中 | 显示 "Loading..." 覆盖层 |
| 只读（执行中） | `editable: false`，视觉上略微变暗 |

#### 5.2.2 Action Bar

紧贴编辑器下方的操作按钮行。

```
┌──────────────────────────────────────────────────┐
│ [Negotiate] [Execute] [Mock Test]   ⏱ 0.32s    │
└──────────────────────────────────────────────────┘
```

**按钮样式（全手写 Tailwind）:**

```tsx
// 基础按钮组件（无抽象，直接写 class）
<button className={`
  inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium
  transition-colors duration-150
  ${variant === 'primary'
    ? 'bg-blue-600 text-white hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500'
    : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-gray-100 disabled:opacity-50'
  }
`}>
```

**按钮行为:**

| 按钮 | 行为 | 禁用条件 |
|------|------|----------|
| Negotiate | 用当前 Schema 对选中 Provider 发起协商 | Schema 无效 或 未选 Provider |
| Execute | 协商成功后执行调用 | 协商未完成 或 无有效 Schema Lock |
| Mock Test | 运行 Mock 测试（绕过真实 HTTP 调用） | Schema 无效 |

**请求中状态:**

- 按钮显示 `spinner`（Tailwind `animate-spin` + SVG 环）
- 按钮文字变为 "Negotiating..." / "Executing..." / "Testing..."
- 按钮 `disabled`
- RIGHT PANEL 显示 loading 标签

#### 5.2.3 Mock Test Section

位于 Action Bar 下方的可折叠区域，用于验证 Router 逻辑而不实际调用 Provider API。

```
┌──────────────────────────────────────────────────┐
│ Mock Test                          [−] Collapse  │
├──────────────────────────────────────────────────┤
│                                                  │
│ Mock Response Editor (CodeMirror, JSON)          │
│ 预填基于当前 Schema 的 mock 响应模板              │
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ {                                            │ │
│ │   "choices": [{ "message": { "content": "" }}]│ │
│ │ }                                            │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ [Run Mock Test]                                  │
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ ✅ Passed  (or  ❌ Failed)                    │ │
│ │ Expected: ...  Got: ...                       │ │
│ │ Fields mapped: 3/3                            │ │
│ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

**Mock 测试流程:**

1. 用户编辑 Agent Schema（或使用默认示例）
2. 填写 Mock 响应 JSON（模拟 Provider 返回原始响应）
3. 点击 "Run Mock Test"
4. Playground 调用 Router 的 Mock 模式：
   - 运行协商（不依赖 Provider）
   - 运行字段映射（将 Mock 响应通过 mapper 转换为标准化输出）
   - 验证映射结果
5. 显示通过/失败及差异

**Mock 测试状态:**

| 状态 | 表现 |
|------|------|
| 未运行 | 区域折叠，仅显示标题和展开按钮 |
| 运行中 | 按钮显示 spinner，结果区显示 "Running..." |
| 通过 | 绿色 `✅ Passed` + 映射统计 |
| 失败 | 红色 `❌ Failed` + 差异对比 |
| 错误 | 红色错误详情 + 堆栈（如有） |

### 5.3 RIGHT PANEL: Response Viewer（6 标签页）

```
┌──────────────────────────────────┐
│ RESPONSE                         │  ← 面板标题
├──────────────────────────────────┤
│ [Formatted] [Raw JSON] [Logs] [Errors] [TypeScript] [Python] │  ← 6 个标签
├──────────────────────────────────┤
│                                  │
│  标签页内容区                       │
│                                  │
│  ───── Status Bar ─────          │
│  Provider: openai | Status: 200  │  ← 底部信息栏
│  Duration: 1.2s | Tokens: 124    │
└──────────────────────────────────┘
```

**标签页规范:**

| 标签 | 内容 | 格式 |
|------|------|------|
| Formatted | 标准化后的 Router 结果，字段名与 Schema 对应 | 结构化展示（字段名: 值列表），代码块加 `<pre>` |
| Raw JSON | Provider 原始响应的完整 JSON | CodeMirror 只读实例，JSON 格式化+高亮 |
| Logs | 协商和执行过程中的结构化日志 | 时间戳流水，每行 `[LEVEL] message`，可折叠详情 |
| Errors | 协商/执行中的错误列表 | 红色/黄色卡片，每个错误包含 code + message + details |
| TypeScript SDK | 从 Schema Lock 生成 TypeScript SDK 代码 | CodeMirror 只读实例，TypeScript 语法高亮 |
| Python SDK | 从 Schema Lock 生成 Python SDK 代码 | CodeMirror 只读实例，Python 语法高亮 |

**标签页交互:**

- 标签栏: `flex gap-0 border-b border-gray-700`
- 选中标签: `text-blue-400 border-b-2 border-blue-400`
- 未选中标签: `text-gray-400 hover:text-gray-200`
- 标签内容区: `p-3 overflow-auto max-h-[calc(100vh-200px)]`
- 无内容时显示 empty state（各标签页不同）

**各标签页 Empty State:**

| 标签 | 无内容时显示 |
|------|-------------|
| Formatted | "No response yet. Run Negotiate or Execute to see results." |
| Raw JSON | 同 Formatted |
| Logs | "No logs generated yet." |
| Errors | 不显示此标签（隐藏，仅在存在错误时显示） |
| TypeScript SDK | "No schema lock available. Run Negotiate first to generate SDK code." |
| Python SDK | 同 TypeScript SDK |

**底部信息栏:**

- 始终可见，位于面板底部
- 显示：Provider ID, HTTP Status, Duration, Token 使用量
- 风格：`text-xs text-gray-400 border-t border-gray-700 p-2`

### 5.4 Status Bar（全页面底部）

```
┌─────────────────────────────────────────────────────────────────────┐
│ ● Idle                  │ Provider: openai │ Schema: valid │ v0.1.0 │
└─────────────────────────────────────────────────────────────────────┘
```

固定全局底部，展示当前整体状态：

| 字段 | 说明 |
|------|------|
| 状态指示 | 彩色圆点 + 文字：`● Idle` / `● Negotiating` / `● Executing` / `● Error` |
| 当前 Provider | 选中的 Provider ID，未选择显示 "-" |
| Schema 状态 | `valid` / `invalid` / `empty` |
| 版本号 | Playground 版本 |

颜色对应：
- Idle: `text-gray-400`
- Negotiating/Executing: `text-blue-400`（加 `animate-pulse`）
- Success: `text-green-400`
- Error: `text-red-400`

---

## 6. 数据流

### 6.1 核心数据流

```
用户编辑 Schema (CodeMirror)
        │
        ▼  onChange (debounced 500ms)
Schema 状态更新 (React state)
        │
        ▼
JSON 校验 → 有效/无效 (lint gutter + status bar)
  无效: 按钮禁用，显示错误行
  有效: 按钮启用
        │
        ▼
用户点击 [Negotiate]
        │
        ▼
调用 Router.negotiate(schema, providerId)
        │
        ├─ 成功: SchemaLock → 存入 state → RIGHT PANEL Formatted 标签更新
        │         → 协商日志 → Logs 标签追加
        │         → 底部信息栏更新
        │
        └─ 失败: Error → RIGHT PANEL Errors 标签显示
                  → Status Bar 变红
        │
        ▼
用户点击 [Execute] (协商成功后)
        │
        ▼
调用 Router.execute(schemaLock, input)
        │
        ├─ 成功: 标准化结果 → Formatted / Raw JSON 标签更新
        │
        └─ 失败: Error → Errors 标签
```

### 6.2 Mock 数据流

```
用户填写 Mock 响应 JSON
        │
        ▼
点击 [Run Mock Test]
        │
        ▼
Router.mockRun(schema, mockResponse)
        │
        ├─ 运行协商 (bypass Provider 连接)
        ├─ 运行字段映射
        ├─ 验证输出符合 Schema
        │
        └─ 返回: { passed, expected, got, mappedFields, errors[] }
```

### 6.3 组件间通信

不使用全局状态管理库。使用 React Context + useReducer (或 useState lifting) 在三个面板间共享状态：

```typescript
// AppState (useReducer at root)
interface AppState {
  providers: ProviderCard[]
  selectedProviderId: string | null
  schema: string              // CodeMirror 原始内容
  schemaValid: boolean
  schemaErrors: LintError[]
  negotiationResult: SchemaLock | null
  executionResult: ExecutionResult | null
  mockTestResult: MockResult | null
  logs: LogEntry[]
  errors: AppError[]
  activeTab: 'formatted' | 'raw' | 'logs' | 'errors' | 'typescript' | 'python'
  status: 'idle' | 'negotiating' | 'executing' | 'mock-testing' | 'error'
  timing: { negotiate?: number; execute?: number }
}
```

Context 在 `App.tsx` 层提供，左右中三个面板组件通过 `useContext` 消费。

---

## 7. Mock 测试详细规范

### 7.1 Mock 模式语义

Mock 测试使用 Router 的 mock 模式，其行为：

1. **不发起 HTTP 请求** — Connector 被替换为 MockConnector，直接返回用户提供的 Mock 响应
2. **完整运行协商流程** — 验证 Schema 匹配 Provider 能力
3. **执行字段映射** — 验证 mapper 能正确将 mock 响应映射为标准化输出
4. **验证输出 Schema** — 检查映射结果是否符合 output_schema 定义

### 7.2 Mock 响应模板

当用户选中 Provider 并编辑 Schema 后，Playground 自动生成 Mock 响应模板：

- 从 Provider Card 的 `features[].response_template` 读取（如果存在）
- 否则从 output_schema 各字段生成默认空值模板
- 用户可自由修改

### 7.3 Mock 测试结果详情

| 指标 | 说明 |
|------|------|
| Passed/Failed | 所有映射是否按预期完成 |
| Expected | Schema 要求的输出字段列表 |
| Got | 实际映射得到的字段列表 |
| Field Coverage | `成功映射字段数 / 总字段数` |
| Missing Fields | 未被映射的字段名称列表 |
| Extra Fields | 映射产生了 Schema 未定义的字段 |
| Type Mismatches | 输出值类型与 Schema 声明不符的字段 |

---

## 8. 文件结构

```
apps/playground/src/
├── main.tsx                 # React 入口
├── App.tsx                  # 根组件：Context Provider + 三栏布局 + StatusBar
├── context.ts               # AppState 类型 + Context + Provider
├── components/
│   ├── ProviderSelector.tsx  # LEFT PANEL: Provider 列表 + 卡选择
│   ├── ProviderCard.tsx      # 单个 Provider 卡片
│   ├── SchemaEditor.tsx      # CENTER PANEL: CodeMirror 编辑器
│   ├── ActionBar.tsx         # CENTER PANEL: 操作按钮行
│   ├── MockTestSection.tsx   # CENTER PANEL: Mock 测试区域
│   ├── ResponseViewer.tsx    # RIGHT PANEL: 6 标签页容器
│   ├── TabFormatted.tsx      # 标准化结果展示
│   ├── TabRawJson.tsx        # 原始 JSON 展示（只读 CodeMirror）
│   ├── TabLogs.tsx           # 结构化日志
│   ├── TabErrors.tsx         # 错误列表
│   ├── TabTypeScript.tsx     # TypeScript SDK 代码展示
│   ├── TabPython.tsx         # Python SDK 代码展示
│   ├── StatusBar.tsx         # 全局底部状态栏
│   ├── ResizablePanel.tsx    # 可拖拽分割面板容器
│   └── Dialog.tsx            # 原生 <dialog> 封装
├── hooks/
│   ├── useCodeMirror.ts      # CodeMirror 实例管理 hook
│   ├── useNegotiate.ts       # 协商调用 hook
│   ├── useExecute.ts         # 执行调用 hook
│   └── useMockTest.ts        # Mock 测试 hook
├── lib/
│   ├── router-client.ts      # 封装对 @synapse-router 库的调用
│   └── mock-runner.ts        # Mock 测试运行逻辑
└── styles/
    └── index.css             # Tailwind 入口 + 全局样式
```

---

## 9. 关键实现约束

### 9.1 CodeMirror 集成

- 编辑器实例在 useEffect 中创建，组件卸载时 `destroy()`
- Schema 内容变化时更新 AppState 的 `schema` 字段
- 编辑器在外部分配 content 时使用 `editor.dispatch({ changes: { from: 0, to: doc.length, insert: newContent } })`
- 不在 editor content 和 React state 之间做双向绑定，仅单向：编辑器 → React state

### 9.2 面板分割

- 使用 CSS Grid 三列布局：`grid-template-columns: leftWidth px 1fr rightWidth px`
- 拖拽事件：`onMouseDown` 启动拖拽 → `onMouseMove` 更新宽度 → `onMouseUp` 结束
- 分割线组件在拖拽时应用 `user-select: none` 防止文本选中

### 9.3 对话框

- 封装 `<dialog>` 的 `showModal()` 和 `close()`
- 点击 backdrop（`::backdrop`）关闭：监听 `<dialog>` 的 `mousedown` 事件，判断点击目标
- 按 Escape 键关闭：`<dialog>` 原生支持
- 对话框打开时阻止 body 滚动：`<dialog>` 原生 `overflow: hidden` 已处理
- 内容区域超出时内部滚动

### 9.4 与 Router 库的集成

Playground 直接在浏览器中加载 `@synapse-router/*` 包的 ESM 版本：

```typescript
// router-client.ts
import { Router } from '@synapse-router/router'
import { createConnector } from '@synapse-router/connector'
import type { AgentSchema, SchemaLock, ExecutionResult } from '@synapse-router/core'

// Vite 配置 dev server proxy 将请求转发到本地 API Server
// 或直接 new Router() + Connector 在浏览器侧运行
```

---

## 10. 初始状态与默认值

Playground 启动时：

1. 左侧 Provider 列表为空，显示 "Scanning providers..." 骨架屏
2. 中央编辑器显示默认示例 Agent Schema（预填一个 chat completions 示例）
3. 右侧 Response 面板全部标签为空（显示 empty state）
4. Status Bar 显示 `● Idle`
5. Mock Test 区域折叠

默认示例 Schema：

```json
{
  "agent_id": "my-agent",
  "agent_name": "My Agent",
  "version": "1.0.0",
  "features": [
    {
      "feature_id": "chat",
      "intent": "chat",
      "input_schema": {
        "name": "input",
        "fields": [
          { "name": "messages", "type": "array", "required": true, "description": "对话消息列表" }
        ]
      },
      "output_schema": {
        "name": "output",
        "fields": [
          { "name": "choices", "type": "array", "description": "模型返回的 choices" }
        ]
      }
    }
  ]
}
```

---

## 11. 错误场景与边界处理

| 场景 | 处理方式 |
|------|----------|
| Provider Registry 扫描失败 | LEFT PANEL 显示错误卡片 + Status Bar 红色状态 + Error 提示 |
| CodeMirror 加载失败 (CDN/ESM 解析) | 降级为 `<textarea>`，显示警告 "编辑器加载失败，已降级为纯文本编辑" |
| Schema 无效时点击 Negotiate | 按钮不可用，tooltip 提示 "Schema contains errors" |
| 协商超时（>30s） | AbortController 中止请求，显示 "Negotiation timed out" 错误卡片 |
| 执行时 Provider 网络错误 | Errors 标签显示 HTTP 错误详情，不影响 Schema 和协商状态 |
| Mock 响应 JSON 解析失败 | Mock Test 按钮旁显示小红色感叹号，hover 提示 "Invalid mock response JSON" |
| 面板宽度拖拽到最小值 | 分割线到达 min-width 后不再响应拖拽 |
| 未选 Provider 点击 Negotiate | Negotiate 按钮 disabled，tooltip 提示 "Select a provider first" |
| 浏览器窗口 resize | 面板按比例缩放，维持左右面板的固定宽度和中间弹性宽度 |
| localStorage 持久化（可选） | 用户 Schema 编辑内容每 30s 自动保存到 localStorage，页面刷新恢复 |

---

## 附录 A: Tailwind Config 定制

```ts
// tailwind.config.ts (或 tailwind.config.js)
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gray: {
          850: '#1a1d24',  // 卡片背景色
        },
      },
    },
  },
}
```

## 附录 B: 无 shadcn 的手写组件清单

所有 UI 元素均为手写 Tailwind utility classes，无组件库依赖：

| 元素 | 实现方式 |
|------|----------|
| Button | 直接 `<button className="...">` |
| Card | `<div className="bg-gray-850 border border-gray-700 rounded-lg p-3">` |
| Tabs | `<div>` 标签栏 + 条件渲染内容区 |
| Dialog | 原生 `<dialog>` + `showModal()` |
| Badge/Pill | `<span className="bg-gray-800 text-gray-300 text-xs rounded-md px-2 py-0.5">` |
| Spinner | SVG `animate-spin` |
| Skeleton | `<div className="animate-pulse bg-gray-800 rounded-lg h-4">` |
| Tooltip | CSS `group-hover` + absolute positioning |
| Status Dot | `<span className="w-2 h-2 rounded-full inline-block">` |
| Divider | `<div className="h-px bg-gray-700/50">` |
| Collapsible | `useState` + `max-height` transition |
| Scroll Area | `overflow-auto` |
| Input / Textarea | `<input>/<textarea className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2">` |
