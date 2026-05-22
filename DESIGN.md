# DESIGN.md: Synapse Registry Design System

> 此文档从 Synapse Registry Web App (`apps/web/`) 提取设计规范，供 **synapse-router 产品文档站** 保持视觉一致性。

## Source
- **Source project**: Synapse Registry
- **Stack**: Next.js 16 + Tailwind CSS v4 + React 19
- **Theme**: 深色主题，单色系 (monochrome dark)，无亮色模式
- **Capture date**: 2026-05-22

## Design Summary

Synapse 系列产品使用 **极简单色深色主题** — 无色彩竞争，纯靠层级和间距驱动视觉节奏。核心是 `zinc` 色系的灰度层级（950→100），点缀 `emerald-400` 作为唯一的功能色（链接/版本/成功状态）。所有组件使用 `rounded-xl` 圆角、微妙的 `border-zinc-800` 描边、半透明背景（`bg-zinc-900/50`）的卡片式设计。这是一种 **开发者优先、内容为王** 的审美，没有花哨的渐变或复杂的动画。

## Design Tokens

### Colors

| Role | Token | Hex | Usage |
|------|-------|-----|-------|
| **Background** | `--background` | `#09090b` (zinc-950) | 页面主背景 |
| **Surface** | `bg-zinc-900/50` | `#18181b / 50%` | 卡片/面板背景 |
| **Surface hover** | `bg-zinc-900` | `#18181b` | 卡片 hover 状态 |
| **Border** | `--border` | `#27272a` (zinc-800) | 卡片/导航/分割线边框 |
| **Border hover** | `hover:border-zinc-600` | `#52525b` | 可交互元素 hover 边框 |
| **Border light** | `border-zinc-800/50` | — | 更轻的分割线 |
| **Text primary** | `--foreground` | `#fafafa` (zinc-100) | 标题/主要文本 |
| **Text body** | `text-zinc-300` | `#d4d4d8` | 正文 |
| **Text secondary** | `--muted-foreground` | `#a1a1aa` (zinc-400) | 次要文本/描述 |
| **Text muted** | `text-zinc-500` | `#71717a` | 辅助信息/版权 |
| **Accent** | `text-emerald-400` | `#34d399` | 版本号/链接/成功/亮点 |
| **Accent bg** | `bg-emerald-800` | `#065f46` | 版本号背景/装饰下划线 |
| **Destructive** | `text-red-400` | `#f87171` | 错误/警告 |
| **Destructive bg** | `border-red-900/50 bg-red-950/30` | — | 错误提示框 |
| **Info** | `text-blue-400` | `#60a5fa` | GET 请求/外部链接 |
| **Warning** | `text-yellow-400` | `#fbbf24` | PATCH/测试版 |
| **Code inline bg** | `bg-zinc-800` | `#27272a` | 行内代码背景 |
| **Code text** | `text-pink-400` | `#f472b6` | 行内代码文本（Markdown） |
| **Scrollbar** | `#3f3f46` (zinc-600) | — | 自定义滚动条 |

### Typography

| Property | Value |
|----------|-------|
| **Font family** | `system-ui, -apple-system, sans-serif`（无自定义字体） |
| **Monospace** | `font-mono`（浏览器默认等宽字体） |
| **Heading** | `font-bold text-white tracking-tight` |
| **Body** | `text-sm text-zinc-400` 或 `text-zinc-300` |
| **Small/Muted** | `text-xs text-zinc-500` |
| **Prose** | Tailwind 的 `prose prose-invert` + 自定义覆盖（GitHub Dark 风格） |

### Spacing & Layout

| Pattern | Classes |
|---------|---------|
| **Page wrapper** | `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` |
| **Section padding** | `px-4 py-8 sm:px-6 lg:px-8` |
| **Card padding** | `p-5` 或 `p-6` |
| **Grid (cards)** | `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` |
| **Flex gap** | `gap-3`, `gap-4`, `gap-6`, `gap-10` |
| **Icon/text inline** | `flex items-center gap-2` |
| **Border radius** | `rounded-lg`（按钮）, `rounded-xl`（卡片） |
| **Shadow** | `shadow-xl`（下拉菜单） |

## Components

### Navbar
- **Outer**: `sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur`
- **Inner**: `mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8`
- **Logo area**: `flex items-center gap-3` + `text-lg font-semibold text-white`
- **Nav link**: `text-sm text-zinc-400 hover:text-white transition`
- **Active link**: `text-white`
- **Auth button**: `rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-600 transition`

### Card（通用）
```html
<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition hover:border-zinc-600 hover:bg-zinc-900">
```

### Button
```html
<button class="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-600 active:scale-95">
```

### Tag
```html
<span class="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
```

### Badge (Pill)
```html
<span class="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-300">
```

### Stat Card
```html
<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
  <div class="flex items-center gap-2 text-2xl font-bold text-white">42</div>
  <p class="mt-1 text-sm text-zinc-500">Label</p>
</div>
```

### Dropdown Menu
```html
<div class="rounded-xl border border-zinc-800 bg-zinc-900 p-2 shadow-xl">
  <a class="block rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">Item</a>
</div>
```

### Error Box
```html
<div class="rounded-xl border border-red-900/50 bg-red-950/30 p-6 text-red-400">
  Something went wrong
</div>
```

### Search Input
```html
<input class="w-full max-w-2xl rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none" placeholder="Search..." />
```

### Footer
```html
<footer class="border-t border-zinc-800 px-4 py-6 text-center text-xs text-zinc-500">
  <div class="mx-auto max-w-7xl">© 2026 · Product Name</div>
</footer>
```

### Inline Code
```html
<code class="rounded bg-zinc-800 px-1.5 py-0.5 text-sm text-pink-400 font-mono">
```

### Scrollbar（全局）
```css
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #52525b; }
* { scrollbar-width: thin; scrollbar-color: #3f3f46 var(--background); }
```

## Page Patterns

### 通用页面骨架
```tsx
<html lang="en" className="dark">
<body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
  <div className="flex min-h-screen flex-col">
    <Navbar />
    <main className="flex-1">{children}</main>
    <Footer />
  </div>
</body>
</html>
```

### Home / Landing Page
- Hero section：大标题 + 描述 + CTA 按钮
- 统计面板 StatCard 行
- Staff Picks / Featured 区域（Card 网格）
- 分类浏览或 CTA 区块

### Listing Page
- 顶部：页面标题 + 搜索 + 筛选
- 内容：Card 网格 `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`
- 每张卡片：标题 + 描述截断 + 标签 + 版本/类别

### Detail Page（两栏布局）
- 左侧主内容（README/文档），右侧元数据侧栏
- 侧栏：版本号、分类、标签、安装命令（可复制）
- Tabs：README / Integration Guide / Specification
- 代码块深色背景 + 复制按钮

### Compare Page
- Feature matrix 表格
- 表头：产品名 + 评分
- 行：特性名称 + 各产品支持情况

---

## Agent Build Instructions

为 **synapse-router 产品文档站** 保持与 Synapse Registry 视觉一致，请遵循以下规则：

### 1. 初始化 Tailwind 配置

- 使用 Tailwind CSS v4（`@import "tailwindcss"` 方式）
- 无需自定义颜色扩展 — 使用 Tailwind 内置 `zinc` 色系即可
- 需要自定义 CSS 变量（参考 globals.css），定义在 `:root` 中
- 安装 `@tailwindcss/typography` 获取 `prose prose-invert` 支持（文档/文章渲染）

### 2. 全局样式（globals.css）

```css
@import "tailwindcss";

:root {
  --background: #09090b;
  --foreground: #fafafa;
  --muted: #27272a;
  --muted-foreground: #a1a1aa;
  --border: #27272a;
  --primary: #fafafa;
  --primary-foreground: #09090b;
  --accent: #27272a;
  --ring: #a1a1aa;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: system-ui, -apple-system, sans-serif;
}
```

### 3. 布局复用

- `<html>` 强制 `className="dark"`
- 页面使用 `flex min-h-screen flex-col` 结构
- Navbar：`sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur`
- 内容容器：`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- Footer：`border-t border-zinc-800 px-4 py-6 text-center text-xs text-zinc-500`

### 4. 通用组件映射

| 需求 | 使用 Pattern |
|------|-------------|
| 文档卡片/特性卡片 | `rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 hover:border-zinc-600` |
| CTA 按钮 | `rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm hover:border-zinc-600` |
| 版本/状态标记 | `rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-300` |
| 行内代码 | `<code class="rounded bg-zinc-800 px-1.5 py-0.5 text-sm text-pink-400 font-mono">` |
| 代码块 | `prose prose-invert` 或自定义深色背景块 |
| CLI 命令示例 | `font-mono text-emerald-400` |
| 特性列表 | 使用 Tailwind prose 或自定义 flex/grid |
| 错误提示 | `rounded-xl border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-400` |
| Divider | `border-t border-zinc-800` |

### 5. 交互与动效

- 所有可交互元素添加 `transition` 或 `transition-colors`
- 按钮点击反馈：`active:scale-95`
- 卡片 hover：`hover:border-zinc-600 hover:bg-zinc-900`
- 链接 hover：`hover:text-white`（从 `text-zinc-400`）
- 复制按钮：`opacity-0 group-hover:opacity-100`

### 6. 内容页面排版（文档/博客）

- 使用 `prose prose-invert max-w-none` 作为基础
- 推荐自定义 prose 覆盖以匹配 Synapse Registry 风格：
  ```css
  .prose-custom {
    --tw-prose-body: #d4d4d8;
    --tw-prose-headings: #fafafa;
    --tw-prose-links: #34d399;
    --tw-prose-code: #f472b6;
    --tw-prose-pre-bg: #09090b;
    --tw-prose-quotes: #a1a1aa;
  }
  ```

### 7. Logo 与品牌

- Synapse 系列的 logo 使用 `h-8 w-auto` 尺寸
- 导航栏中 logo + 品牌名使用 `flex items-center gap-3`
- 品牌名使用 `text-lg font-semibold text-white`

### 8. 响应式断点

- `sm:` (640px) — 网格从单列变双列
- `lg:` (1024px) — 网格到三列，导航完整显示
- 移动端导航链接用 `hidden sm:flex` 隐藏/显示

## Rerun Inputs
- workflow: `firecrawl-website-design-clone`
- source_url: `https://synapse-registry.vercel.app`
- target_stack: `Next.js + Tailwind CSS v4`
- output: `DESIGN.md`
