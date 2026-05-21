# Stack Research

**Domain:** Billing Integration for Synapse Router | Docusaurus documentation site | Playground UI upgrade
**Researched:** 2026-05-21
**Confidence:** HIGH

---

## Part 1: Billing Integration (Phase 8-10)

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@synapse-router/billing` | workspace:* | Billing engine (pre-call, post-call, quota, fallback) | Already exists as v0.1.0 with all needed strategies. Zero external deps. Already has `preCall()`/`postCall()` API. |
| `@synapse-router/connector` | workspace:* | Thin HTTP connection layer | Already exists. Explicitly NOT modified -- billing wraps it from outside, not hooks inside. |
| `@synapse-router/sdk-generator` | workspace:* | Template-based SDK code generation | Already exists. Billing config emitted as companion file, not embedded in generated code. |
| TypeScript | 5.9+ | Language for integration code | Already established in project. All integration layers use native TypeScript. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs/promises` | built-in | File-based quota storage persistence | For SDK/API runtime sessions needing cross-process quota tracking |
| `node:crypto` | built-in | UUID generation for trace/span IDs | Already used in observability tracer; not needed for billing directly |
| `node:path` / `node:os` | built-in | Config file path resolution | For locating `.synapse/billing.json` in CLI billing commands |
| `@synapse-router/observability` | workspace:* | Billing span tracing | Already has `wrapBilling()` helper, `billing` span name, and `BillingSpanAttrs`. Integration is pre-wired. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Node.js test runner (`node --test`) | Testing the wrapper, FileQuotaStorage, and CLI commands | Already established in project (no test framework needed) |
| TypeScript strict mode | Type safety for integration code | Already enforced across all packages |

### Installation

No new npm packages needed for any phase. All integration uses existing workspace packages:

```bash
# No external installs needed.
# Existing billing package (already built):
pnpm --filter @synapse-router/billing build

# If adding billing as a dependency of the CLI:
pnpm --filter @synapse-router/cli add @synapse-router/billing
```

### Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Function wrapper pattern | Hook system in connector | Never -- connector must stay thin per architecture principle 9 |
| Companion `pricing.json` file | Embed billing in generated SDK | Never -- SDK must stay zero-dependency per architecture principle 8 |
| File-based quota storage | Database-backed quota storage | For multi-process API servers with high concurrency, file storage has write contention |
| `@synapse-router/billing` wrapper | Third-party billing service (Stripe, Chargebee) | Not applicable -- Synapse billing is about provider API cost tracking, not payment processing |

### What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Adding pre/post hooks to `@synapse-router/connector` | Violates connector's thin-layer mandate. Creates precedent for more business logic in connector. | `callWithBilling()` wrapper in `@synapse-router/billing` that composes around `connect()` |
| Embedding billing code in generated SDK client | Violates SDK zero-dependency principle. Generated SDK must not import `@synapse-router/*`. | Companion `pricing.json` emitted by `evolve --with-billing-pricing`, consumed at app level |
| External billing databases (Postgres, SQLite) | Overkill. Quota state is small (one JSON object per provider), needs only simple read/write. | `FileQuotaStorage` implementing existing `QuotaStorage` interface, writing to `~/.synapse/billing/quotas.json` |
| Event-driven billing pipeline | Premature complexity. Only one consumer (the connector call). | Synchronous `preCall()` + `connector()` + `postCall()` in a wrapper function |
| Billing middleware system | Over-engineered. No decorator/interceptor/AOP needed. | Single `callWithBilling()` function with callback (`Billing` + params + call fn -> result) |

### Stack Patterns by Variant

**If billing is needed only for CLI `synapse connect` commands:**
- Use in-memory `QuotaStorage` only (default in `QuotaManager`)
- No file persistence needed -- each CLI session starts fresh
- Pricing config read from `~/.synapse/config.json` or `--billing-config` flag
- CLI billing command is `synapse billing init` to scaffold pricing config

**If billing is needed for generated SDK runtime:**
- Use `FileQuotaStorage` with auto-save on every `postCall()`
- Pricing config from companion `pricing.json` emitted during `synapse evolve`
- Application imports `Billing` from `@synapse-router/billing` directly
- Wrapper pattern: `callWithBilling(billing, lock, input, connection)` returns wrapped result

**If billing is needed for the HTTP API Server (`apps/api`):**
- Use `FileQuotaStorage` with request-scoped trace context
- Each API request creates a billing context, calls connector, records usage
- File storage handles concurrent writes with atomic JSON rename (acceptable for low concurrency)

### Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@synapse-router/billing@workspace:*` | `@synapse-router/connector@workspace:*` | Types are compatible (`ConnectLock`, `ConnectResult` are shared via core). Billing `PreCallParams` uses `ConnectLock`, `PostCallParams` uses `ConnectResult`. |
| `@synapse-router/billing@workspace:*` | `@synapse-router/observability@workspace:*` | Already compatible. `wrapBilling()` helper exists in observability's router. |
| `@synapse-router/billing@workspace:*` | Node.js 22+ | Zero external deps. Only uses built-in modules. |

### Sources

- Direct code reading of all billing, connector, sdk-generator, cli, and observability source files -- HIGH confidence
- No external sources needed. All patterns and constraints are documented in the project CLAUDE.md and verified against actual source code.

---

## Part 2: Docusaurus Documentation Site + Playground UI Upgrade (v4.0 / Phase 13)

### Core Technologies -- Docusaurus Documentation Site

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@docusaurus/core` | 3.10.1 | Static site generator for documentation | React-based (project already uses React 19); v3 supports `react ^18 \|\| ^19`. Rich plugin ecosystem, built-in versioning, i18n, Algolia search. Better integration than VitePress because we are a React shop. |
| `@docusaurus/preset-classic` | 3.10.1 | Preset bundling docs/blog/pages/sitemap/theme | The standard starting point. Includes `plugin-content-docs`, `plugin-content-pages`, `theme-classic`, `plugin-sitemap`. What we need: docs engine + static pages. |
| `typedoc` | 0.28.19 | TypeScript API documentation generator | Industry standard for generating API reference from JSDoc comments. Parses `.ts` source, outputs either HTML or a JSON model that feeds into the Docusaurus pipeline. |
| `typedoc-plugin-markdown` | 4.11.0 | TypeDoc plugin for Markdown output | Converts TypeDoc output to Markdown files. Required by `docusaurus-plugin-typedoc`. Compatible with `typedoc@0.28.x`. |
| `docusaurus-plugin-typedoc` | 1.4.2 | Runs TypeDoc as part of Docusaurus build | Integrates TypeDoc directly into the Docusaurus CLI (dev + build). Generates Docusaurus-compatible Markdown + sidebar data at `docs/api/`. Sidebar auto-generation from TypeDoc output. Peer dependency: `typedoc-plugin-markdown >= 4.8.0`. |

### Core Technologies -- Playground UI Upgrade

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TailwindCSS 4 | 4.2.4 (existing) | Utility-first CSS framework | Already in place. TailwindCSS 4's `@theme` and `@custom-variant` directives handle the dark theme. No additional CSS framework needed. |
| `@vitejs/plugin-react` | 6.0.x (existing) | Vite React plugin | Already in place. Uses React 19 SWC transforms for fast HMR. |
| `@uiw/react-codemirror` | 4.25.9 (existing) | Code editor component | Already in place. Provides the schema/response editors. No replacement needed. |
| `react-resizable-panels` | 4.11.1 | Resizable panel layout | **New addition -- recommended.** Replaces the hand-rolled ResizablePanel.tsx mouse-event stream. Accessible (keyboard resizing via `Enter`/`ArrowLeft`/`ArrowRight`), simpler code, better DX. Used by VS Code-inspired UIs. |

### Supporting Libraries -- Docusaurus

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@docusaurus/theme-search-algolia` | 3.10.1 | Algolia DocSearch integration | For launch. Provides full-text search across docs. Requires Algolia account (free for open source). Alternative: `@easyops-cn/docusaurus-search-local` (no account needed, local index, v0.55.1). |
| `@docusaurus/theme-mermaid` | 3.10.1 | Mermaid diagram rendering | **Defer to post-launch.** Useful if docs need architecture diagrams. Not needed for initial Getting Started + API reference content. |
| `@docusaurus/plugin-google-gtag` | 3.10.1 | Google Analytics via gtag | **Defer to post-launch.** Analytics optional for docs site. |

### Supporting Libraries -- Playground

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | 1.16.0 | SVG icon library | **Optional.** Replaces ~15 lines of inline SVG per icon in ActionBar, StatusBar, and Tab components with declarative `<IconName />` components. Consistent sizing (24px default). Tree-shakeable via ESM. Only add if icon consistency matters for the visual upgrade. |
| `@radix-ui/react-tabs` | 1.1.13 | Accessible tab primitive | **Only if** the Tab* components need keyboard navigation (ArrowLeft/Right), roving tabindex, and screen-reader labels. Current implementation may already handle this with CSS. Inspect before adding. |
| `@radix-ui/react-dialog` | 1.1.15 | Accessible modal dialog | For settings/preferences dialogs. If the playground adds a settings panel. **Defer until needed.** |
| Zustand | 5.0.13 | Lightweight state management | **Do NOT add now.** The existing context-based state (via AppProvider) is fine for current complexity. Zustand only becomes valuable if we split the playground into sub-routes with shared state. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `pnpm --filter @synapse-router/docs` | Install/build docs package in monorepo | Works naturally. Docusaurus lives in `apps/docs/`, referenced by workspace. No special monorepo config needed beyond the existing `packages: ["apps/*"]` glob. |

### Installation

#### Docusaurus Documentation Site

```bash
# From monorepo root, create the docs app:
pnpm create docusaurus@latest apps/docs classic --typescript

# Then add dev dependencies for API reference generation:
cd apps/docs
pnpm add -D typedoc@^0.28 typedoc-plugin-markdown@^4.11 docusaurus-plugin-typedoc@^1.4
```

`docusaurus.config.js` plugin config:

```js
// In apps/docs/docusaurus.config.js
module.exports = {
  plugins: [
    [
      'docusaurus-plugin-typedoc',
      {
        entryPoints: ['../../packages/core/src/index.ts'],
        tsconfig: '../../tsconfig.base.json',
        // Output goes to docs/api/ by default
      },
    ],
  ],
};
```

For all packages' API docs, add one plugin instance per entry point (or point to multiple entry points in a single plugin instance).

#### Playground UI Upgrade

```bash
# Minimal addition (if resizable panels needed):
cd apps/playground
pnpm add react-resizable-panels@^4

# Optional icon addition:
pnpm add lucide-react@^1
```

### Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Docusaurus** | VitePress 1.6.4 | If the team were Vue-based. VitePress is Vite-native (we use Vite 8), but it is Vue-powered. Since we are a React shop and already use React 19, Docusaurus is the obvious choice. VitePress also has weaker TypeScript API doc tooling. |
| **docusaurus-plugin-typedoc** (recommended) | Standalone `typedoc-docusaurus-theme` | If you need to run TypeDoc independently of the Docusaurus build pipeline. The standalone approach uses `typedoc.json` instead of `docusaurus.config.js`. Use only if the Docusaurus build is too slow and you want incremental API doc generation. |
| **@easyops-cn/docusaurus-search-local** | Algolia DocSearch | If the project is not open source (Algolia DocSearch requires an approved project for free tier). The local search plugin (v0.55.1) works offline, no API key needed. For initial launch, local search may be simpler. |
| **react-resizable-panels** (recommended) | Custom drag-based ResizablePanel.tsx (existing) | The existing implementation works but lacks accessibility (keyboard not supported), uses manual event listener management, and has hardcoded min/max widths. `react-resizable-panels` provides a11y + simpler code. Only replace if resize UX is part of the upgrade. |
| **lucide-react** (optional) | Inline SVG icons (existing) | Inline SVGs work; they just add visual noise to JSX. lucide-react provides consistent, well-designed icons. Only add if the visual upgrade justifies the dependency. |

### What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `shadcn/ui` CLI (v4.7.0) | Adds a CLI tool and project scaffolding overhead. Components are copied into the project (non-tree-shakeable, harder to update). The playground is a single page with ~15 components -- not complex enough to justify a full design system. | Hand-rolled TailwindCSS 4 components. The existing pattern of `className` + Tailwind utilities is sufficient for the current complexity. |
| `framer-motion` (v12.39.0) | Animation library adds 30+ KB to the bundle. The playground is a dev tool, not a marketing site. | TailwindCSS 4 `transition-colors`, `transition-opacity`, and CSS transitions. |
| `react-router-dom` (v7.15.1) | The playground is a single-page app. Adding routing would be premature. | Fragment-based view switching (if needed). |
| `@tanstack/react-query` (v5.100.11) | No server state caching needed. The playground makes one-off negotiate/execute calls. | Fetch-on-click with `useState`/`useReducer` (existing pattern). |
| `zustand` (v5.0.13) | The existing React Context (`AppProvider`) handles all shared state. | React Context (existing). |
| Docusaurus blog section | The project needs documentation, not a blog. Adds build time and navigation clutter. | Delete the blog section during `create-docusaurus` scaffolding. |
| Docusaurus PWA plugin | Documentation site does not need service workers or offline support. | Just build static HTML/JS. |
| `typedoc-docusaurus-theme` standalone | Duplicate of `docusaurus-plugin-typedoc` which already wraps this internally. | `docusaurus-plugin-typedoc` (the integrated approach). |
| Docusaurus v2 (any version) | Outdated. The project Node.js 22 requirement is well above Docusaurus v2's requirement. v3 has better React 19 support, faster builds, MDX v3. | Docusaurus v3.10.1. |

### Stack Patterns by Variant

**If generating API docs for all 15 packages:**
- Create one `docusaurus-plugin-typedoc` entry per package being documented
- Entry point example: `entryPoints: ['../../packages/core/src/index.ts', '../../packages/router/src/index.ts']`
- Use a single `out: 'docs/api'` directory (default)
- Sidebar auto-generation via `sidebar.autoConfiguration: true` (default)

**If Docusaurus build is too slow with all TypeDoc plugins:**
- Switch to standalone approach: run `typedoc` separately with `typedoc-docusaurus-theme`
- Cache generated Markdown in git (`docs/api/`)
- Only re-run `typedoc` when source code changes
- Docusaurus build stays fast (already has Markdown)

**If deploying to GitHub Pages (likely for open source project):**
- Set `organizationName: 'qise-tech'`, `projectName: 'synapse-router'`
- Use `deploymentBranch: 'gh-pages'`
- Add `.nojekyll` to `static/` directory
- Use GitHub Actions: `actions/deploy-pages@v4` with `upload-pages-artifact`
- See official Docusaurus deployment guide for full workflow

**If deploying to Vercel (alternative):**
- Set `Base directory` to `apps/docs` in Vercel project settings
- Build command: `pnpm build`
- Output directory: `build`
- Framework preset: Docusaurus

**If playground visual upgrade needs consistent icons:**
- Add `lucide-react` and replace `svg` elements in:
  - `ActionBar.tsx` (loading spinner to `Loader2`)
  - `StatusBar.tsx` (any inline icons)
  - Tab header components
- Pattern: `import { Loader2, Check, X, Play } from 'lucide-react'`

### Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@docusaurus/core@3.10.1` | `react@^18.0.0 \|\| ^19.0.0` | Confirmed via npm registry. Project already uses React 19.2.6. |
| `docusaurus-plugin-typedoc@1.4.2` | `typedoc-plugin-markdown@>=4.8.0` | Peer dependency. Install together. |
| `typedoc-plugin-markdown@4.11.0` | `typedoc@0.28.x` | Peer dependency. Must be exact minor range. |
| `@docusaurus/preset-classic@3.10.1` | `@docusaurus/core@3.10.1` | Same version required. Always match core. |
| `react-resizable-panels@4.11.1` | `react@^16.14.0 \|\| ^17.0.0 \|\| ^18.0.0 \|\| ^19.0.0` | Works with React 19. No peer dep issues. |
| `lucide-react@1.16.0` | `react@^18.0.0 \|\| ^19.0.0` | Fully compatible with React 19. |

### Integration with Existing Monorepo

**Workspace config** already covers `apps/*`:
```yaml
# pnpm-workspace.yaml (unchanged)
packages:
  - "apps/*"
  - "packages/*"
  - "packs/*"
```

The new `apps/docs/` directory is automatically discovered. Just run:
```bash
pnpm install
pnpm --filter @synapse-router/docs build
```

**Potential pitfalls:**
1. TypeDoc resolves TypeScript source from the monorepo root. The `tsconfig` path in the plugin config must be relative to `apps/docs/`. Example: `../../tsconfig.base.json`.
2. Docusaurus's `pnpm` compatibility with workspace dependencies: if docs need to import from `@synapse-router/*` for code samples, use `pnpm add @synapse-router/core` within `apps/docs/` to reference the workspace package.
3. Build order: Docusaurus depends on TypeDoc reading TypeScript source. If the project source has not been compiled, the JSDoc comments are still available in raw `.ts` files, so `tsc` is not a prerequisite for TypeDoc. But `docusaurus build` should run after `pnpm build` to ensure any imported workspace packages are compiled.

### Sources

- Official Docusaurus docs (docusaurus.io) -- v3.10.1 confirmed, installation guide, deployment options, plugin list -- HIGH confidence
- typedoc-plugin-markdown docs (typedoc-plugin-markdown.org) -- docusaurus-plugin-typedoc quick-start guide and options -- HIGH confidence
- npm registry via `npm view` -- exact version numbers for all packages -- HIGH confidence
- Project source code review -- existing playground structure, components, styles, workspace config -- HIGH confidence

---
*Stack research for: Synapse Router v4.0 Documentation Site and Playground UI Upgrade*
*Researched: 2026-05-21*
