# Pitfalls Research: Docusaurus Documentation Site + Playground UI Upgrade

**Domain:** Adding a documentation site (Docusaurus) and upgrading an existing Playground UI (React + Vite) in an existing TypeScript monorepo (pnpm workspaces, 15 packages, 4 apps, ~57k LOC)
**Researched:** 2026-05-21
**Confidence:** HIGH (based on codebase analysis of existing playground, Docusaurus official docs v3.10.1, @uiw/react-codemirror, Vite v8 config)

## Critical Pitfalls

### Pitfall 1: Bundler Conflict -- Docusaurus (webpack) vs Playground (Vite 8) in Same Monorepo Build Pipeline

**What goes wrong:**
The monorepo currently uses Vite for all front-end builds (playground via `@vitejs/plugin-react` + `@tailwindcss/vite`). Docusaurus v3 uses webpack under the hood, NOT Vite. Adding Docusaurus means the monorepo now has two bundlers with different behaviors:

- **CI build time doubles** -- `pnpm build -r` runs both webpack (docs) and Vite (playground), each with its own warm-up, cache, and dependency graph resolution
- **Cache directories diverge** -- `node_modules/.cache/webpack` vs `node_modules/.cache/vite`, no shared caching
- **Resolve behavior differs** -- webpack and Vite resolve tsconfig paths differently. A `@alias` that works in the Vite-powered playground may not resolve in Docusaurus, causing build failures only in CI
- **CSS processing differs** -- Docusaurus uses its own Infima CSS framework + PostCSS. The playground uses TailwindCSS 4. Custom `@theme` directives and `@import "tailwindcss"` from playground styles have NO effect in Docusaurus pages. Attempting to share Tailwind components between playground and docs will create confusion
- **`tsconfig.json` expectations differ** -- Playground uses `"moduleResolution": "bundler"` (Vite-native). Docusaurus uses its own `@docusaurus/tsconfig` which extends a base config. Running `pnpm typecheck -r` may produce false positives or require merging tsconfigs

**Why it happens:**
The project already has React 19 + Vite 8 working. It is natural to assume Docusaurus, being a React-based static site generator, would integrate smoothly. But Docusaurus has never adopted Vite -- it runs on webpack (with Rspack being evaluated in the experimental `experimental_faster` mode since v3.10). Adding webpack to a Vite-only monorepo introduces a systemic build divergence.

**How to avoid:**
Three strategies, in order of preference:

1. **Isolate Docusaurus build from the monorepo shared build pipeline.** Do NOT add Docusaurus build to the root `pnpm build` command. Instead, create a separate `build:docs` npm script at the root. Keep `pnpm build` as the playground + packages build. This prevents CI slowdown and avoids confusing failures.

   ```json
   // Root package.json
   {
     "scripts": {
       "build": "pnpm -r build",           // playground + packages (Vite + tsc)
       "build:docs": "pnpm --filter @synapse-router/docs build", // Docusaurus (webpack)
       "ci": "pnpm build && pnpm build:docs && pnpm test"
     }
   }
   ```

2. **Do NOT share CSS/Tailwind between docs and playground.** Docusaurus has its own Infima CSS framework. Adding Tailwind to Docusaurus (community approach via postcss + tailwindcss plugin) adds 200KB+ to the docs bundle. Keep playground components isolated from docs. If you need reusable UI components, extract them into a `packages/ui/` package that both can import, but expect different CSS behaviors.

3. **If bundler unification matters** -- wait for Docusaurus v4 (Rspack-based) expected in late 2026, or experiment with `experimental_faster` in Docusaurus v3.10.x which enables Rspack. But do NOT attempt this in v4.0 milestone -- the `experimental_faster` flag is still explicitly labeled as experimental with known issues.

**Warning signs:**
- CI build time jumps from ~30s to >60s after adding docs
- `pnpm build -r` failing with webpack errors that do not reproduce locally in `pnpm dev`
- Import resolution failing in Docusaurus but working in playground (different module resolution behavior)
- CSS styles from playground components "leaking" into docs site or vice versa
- `pnpm typecheck -r` showing errors in docs but not playground

**Phase to address:**
Phase 1 (docs site scaffolding) -- before any content is written. The build isolation decision must be made in the initial scaffolding.

---

### Pitfall 2: API Reference Docs Going Stale -- TypeDoc-Version-Drift Cycle

**What goes wrong:**
The documentation site ships with hand-written API reference pages that describe `@synapse-router/core`, `@synapse-router/negotiator`, `@synapse-router/router`, etc. Three months later, a developer adds a new public method, renames a type, or deprecates a parameter. The hand-written docs never get updated. Users start filing issues: "Your docs say `negotiate()` returns `NegotiationResult` but it actually returns `NegotiateResult`."

With 15 packages and ~57k LOC of TypeScript, manual API documentation is not sustainably maintainable.

**Why it happens:**
Three compounding factors:
1. **Manual documentation is inherently disconnected from code.** There is no compile-time check that `docs/api/core-types.md` matches `packages/core/src/index.ts`. A PR that changes types has no automated requirement to update docs.
2. **The `docusaurus-plugin-typedoc` pipeline is not trivial to set up.** It requires: `typedoc` + `typedoc-plugin-markdown` + `docusaurus-plugin-typedoc` + `typedoc-docusaurus-theme` as dependencies, plus per-package TypeDoc configuration, plus sidebars integration. This setup friction encourages deferring it.
3. **Generated docs are ugly by default.** The first `docusaurus-plugin-typedoc` output is often too verbose, includes private members, uses cryptic type signatures, and has no narrative structure. Developers see the output and decide "hand-written is better" -- which is correct in the short term but unsustainable in the long term.

**How to avoid:**
Implement TypeDoc generation from DAY ONE, even if the initial output is ugly:

1. **Scaffold the typedoc pipeline immediately.** Do NOT defer it to "after we write the hand-written docs." It is much harder to add later when there is already content "in the way."

   ```bash
   pnpm --filter @synapse-router/docs add -D typedoc typedoc-plugin-markdown docusaurus-plugin-typedoc typedoc-docusaurus-theme
   ```

2. **Start with one package.** Configure TypeDoc for `@synapse-router/core` only (the smallest, most stable package). Get the generated output into a Docusaurus sidebar. Accept that it looks imperfect. Iterate on configuration from there.

3. **Use these typedoc options from the start:**
   ```json
   {
     "plugin": ["typedoc-plugin-markdown", "typedoc-docusaurus-theme"],
     "entryPoints": ["../../packages/core/src/index.ts"],
     "tsconfig": "../../packages/core/tsconfig.json",
     "excludePrivate": true,
     "excludeProtected": true,
     "excludeInternal": true,
     "hideGenerator": true,
     "sort": ["source-order"],
     "readme": "none"
   }
   ```

4. **Establish a CI gate:** Add a CI check that compares the generated API docs against the committed ones. If they differ (meaning code changed but docs were not regenerated), the build fails.

5. **Hybrid approach:** Use generated docs for API references (types, functions, classes) and hand-written guides for tutorials, explanations, and getting-started content. The boundary is clear: if it is in a `src/index.ts` export, it is auto-generated. If it is a narrative, it is hand-written.

**Warning signs:**
- "API Reference" section in the docs is a single hand-written `.md` file (no TypeDoc integration)
- `/docs/api/` directory contains `.md` files named after packages (manual content that will drift)
- PRs that change public types but have no corresponding docs changes
- GitHub issues asking "why does the docs say X but the code returns Y"
- The `docusaurus-plugin-typedoc` devDependency is NOT in `apps/docs/package.json`

**Phase to address:**
Phase 1 (docs scaffolding). TypeDoc configuration is part of initial setup, not a Phase 2 "enhancement."

---

### Pitfall 3: Docusaurus v4 Breaking Change Migration Pain

**What goes wrong:**
Docusaurus v4 is actively being planned (umbrella issue #11719, opened Feb 2026 by maintainer slorber). Confirmed breaking changes include:
- Node 24+ required
- React Router v7+ (breaking route behavior changes)
- Rspack v2 as default bundler (webpack configs break)
- `experimental_faster` becomes stable DEFAULT (may break custom webpack configs)
- `configureWebpack` deprecated in favor of `configureBundler`
- TypeScript strict mode becomes default
- CSS Cascade Layers enabled by default (may break custom Infima overrides)

If the v4.0 milestone builds on Docusaurus v3, and v4 drops within 3-6 months (typical Docusaurus major release cadence), the team faces a full migration during another milestone.

**Why it happens:**
Docusaurus v3 is the current stable (v3.10.1 as of April 2026). The v4 umbrella was opened only 3 months ago. It is easy to assume v3 will be stable for years, but the maintainer explicitly states the goal is "to keep the release relatively small, to make it easy to adopt" -- implying v4 is not far off.

**How to avoid:**
1. **Minimize Docusaurus v3 customizations.** Every custom webpack plugin, every `configureWebpack` call, every swizzled theme component is a migration liability. Use only what Docusaurus provides out of the box:
   - Use `@docusaurus/preset-classic` with standard plugins (docs, blog, pages)
   - Do NOT swizzle theme components unless absolutely necessary
   - Do NOT add custom webpack plugins -- prefer Docusaurus-native configuration
   - Use `@site` alias (Docusaurus-builtin) rather than custom resolve aliases

2. **Lock Docusaurus version.** Pin `docusaurus` and all `@docusaurus/*` packages to a specific minor version (e.g., `^3.10.0` not `^3.x.x`). Use `pnpm update` consciously.

3. **Watch the v4 umbrella.** Check issue #11719 before starting. If v4 is imminent (e.g., RC released), start on v4 directly.

4. **Plan migration budget.** Accept that a Docusaurus v3-to-v4 migration will happen. Budget 1-2 days in a future milestone. It is not a reason to avoid Docusaurus -- but it IS a reason to keep the v3 setup minimal.

**Warning signs:**
- `docusaurus.config.ts` contains custom webpack plugin declarations
- swizzled theme components in `src/theme/` (each is a migration burden)
- Docusaurus version is pinned to `^3.0.0` (too permissive, may auto-upgrade to breaking v4 minor)
- CI uses `configureWebpack` for monorepo path resolution
- No plan for React Router v7 migration

**Phase to address:**
Phase 1 (architecture decision). The "minimal customization" policy must be established before any custom plugin is added.

---

### Pitfall 4: CodeMirror Multiple-Instance Performance Collapse in Playground

**What goes wrong:**
The upgraded playground will have 3+ CodeMirror instances on the same page:
1. **SchemaEditor** (main editor, always visible) -- already exists
2. **MockTestSection** (collapsible, second editor) -- already exists
3. **TabRawJson** (read-only, raw response viewer) -- currently plain `<pre>`, may be upgraded to CodeMirror
4. **TabTypeScript** / **TabPython** (read-only, SDK code display) -- currently plain text, may be upgraded

Each CodeMirror `EditorView` instance:
- Creates a full editor state with syntax tree
- Registers DOM event listeners (keyboard, mouse, scroll)
- Maintains a decoration set for lint errors, line numbers, selection
- Runs the syntax tree re-parser on every keystroke in editable instances

With 3-4 visible instances, the page has multiple editor instances competing for memory (~2-5MB each), CPU (syntax re-parsing), and DOM nodes (~50-100 each).

The existing `useCodeMirror.ts` hook also has a subtle fragility: the `useEffect` dependency array is `[options.container, options.editable]`. When `editable` changes, the ENTIRE editor is destroyed and recreated, dropping undo history and cursor position.

**Why it happens:**
The current playground was built as a minimal debug tool. Multiple editors were not a concern. The upgrade (adding read-only CodeMirror for SDK tabs, adding syntax highlighting for raw JSON) naturally pushes toward more instances. Each editor seems simple in isolation, but the aggregate impact is not visible until all tabs are populated with content.

**How to avoid:**
1. **Differentiate editable vs read-only editors.** Read-only editors do NOT need the full `basicSetup`. Use minimal extensions:
   ```typescript
   const readOnlyView = new EditorView({
     doc: content,
     extensions: [
       EditorView.editable.of(false),
       syntaxHighlighting(defaultHighlightStyle),
     ],
   });
   ```

2. **Use tab-switching to MOUNT/DESTROY (not hide/show).** For tabs, destroy the editor when the tab is hidden and recreate when shown. Lazy-init pattern:
   ```typescript
   useEffect(() => {
     if (!containerRef.current || initialized) return;
     viewRef.current = new EditorView({...});
     setInitialized(true);
     return () => {
       viewRef.current?.destroy();
       viewRef.current = null;
     };
   }, [activeTab === 'raw']);
   ```

3. **Keep TabRawJson and TabTypeScript as plain `<pre>` unless there is an explicit need for syntax highlighting.** The spec says "CodeMirror for raw JSON" but plain `<pre>` with `JSON.stringify(..., null, 2)` handles 95% of use cases. Only add CodeMirror if users actually need interactive features (fold, search, jump to line).

4. **Profile before optimizing.** If all 4 editors load in under 200ms combined, this is a non-issue for the MVP.

**Warning signs:**
- Playground page load time exceeds 2 seconds
- Switching between tabs with CodeMirror instances causes visible lag or frozen frames
- `window.performance.memory.usedJSHeapSize` grows continuously as user switches between tabs
- Console warnings: "Long task took XXX ms"

**Phase to address:**
Phase 2 (Playground upgrade: tab enhancement). CodeMirror performance consideration should be part of the tab redesign, not retrofitted later.

---

### Pitfall 5: Playground API Endpoint Hardcoding -- Production Build Breaks

**What goes wrong:**
The existing `lib/api.ts` hardcodes `baseUrl: "http://localhost:3000"`:

```typescript
export function createApiClient(config: ApiConfig = { baseUrl: "http://localhost:3000" }) {
```

This works in dev mode (user runs API server on port 3000 and Vite on port 5173). However, the current `vite.config.ts` has NO proxy configuration -- the API client constructs full URLs: `fetch(\`${config.baseUrl}/negotiate\`)`. The `vite.config.ts` only has `server: { port: 5173 }`.

In **production build** (`pnpm build --filter @synapse-router/playground`), Vite generates static files. The API client STILL tries to fetch `http://localhost:3000`, which does not exist in production. The playground appears broken with no clear error -- just failed fetch requests.

**Why it happens:**
During development, the developer always has the API server running on localhost:3000. The production build path is never tested. This is the classic "works on my machine" anti-pattern. The spec (section 9.4) mentions "Vite proxy" but was never implemented.

**How to avoid:**
1. **Implement Vite proxy for development.** Add proxy configuration so the playground uses relative paths:
   ```typescript
   export default defineConfig({
     plugins: [react(), tailwindcss()],
     server: {
       port: 5173,
       proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } },
     },
   });
   ```
   Update `api.ts` to use `/api` prefix:
   ```typescript
   export function createApiClient(config: ApiConfig = { baseUrl: "/api" }) {
   ```

2. **For production, the playground is NOT a standalone deployable.** It requires the API server. Document this clearly. Show error state in the UI: "Cannot connect to API server at {baseUrl}."

3. **Make the base URL configurable via environment variable:**
   ```typescript
   const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
   ```

**Warning signs:**
- Production build shows empty playground with no data
- Browser console shows `Failed to fetch http://localhost:3000/...` on production
- PR has no changes to `vite.config.ts` regarding proxy
- API client uses absolute `localhost` URLs with no environment variable fallback
- No error UI element for API connection failures

**Phase to address:**
Phase 1 (playground infrastructure). Fix the API client before any UI enhancement, or all new features will be broken in production.

---

### Pitfall 6: Docs Code Snippets That Reference Internal Types and Break

**What goes wrong:**
The documentation site includes TypeScript code examples that import from `@synapse-router/*` packages. These snippets are:
1. **Not type-checked** -- Docusaurus processes them as Markdown + MDX. No TypeScript compiler pass runs over code blocks in `.md` files.
2. **Not importable in user code as-is** -- Users copy-paste snippets. If the snippet shows `import { Router } from '@synapse-router/router'` but the user needs to install that package separately, the snippet creates confusion.
3. **Stale as code evolves** -- The `CLAUDE.md` contains extensive CLI reference. The docs will replicate this information. When CLI flags change, CLAUDE.md gets updated but the docs do not.

**Why it happens:**
Doc authors write code examples by copy-pasting from working source code. This is natural and efficient. But the copy-paste loses the binding to the actual codebase. Without a mechanism to "link" code examples to their source, they drift independently.

**How to avoid:**
1. **Use Docusaurus code block import from source.** Instead of inlining TypeScript, use MDX `import` + `raw-loader` to embed actual source files. This way, code snippets update when the source changes. However, use this SELECTIVELY -- importing entire files creates verbose docs.

2. **For CLI examples, create a script that generates them from actual CLI help output.** Or use a snapshot test ensuring CLI help text matches docs.

3. **Prefer "conceptual" snippets over exact code.** The API reference (auto-generated via TypeDoc) has exact signatures. The guide/tutorial has patterns. This creates a clean separation.

4. **Document version policy.** State clearly: "Tutorial code examples are verified at release time. For exact type signatures, see the auto-generated API reference."

**Warning signs:**
- Doc PRs that update code formatting but not semantics
- GitHub issues: "Your example says `import` from X but that module does not export that function"
- Docs example uses a type name that `git grep` cannot find in any source file
- No CI check that validates TypeScript code blocks in docs

**Phase to address:**
Phase 1 (docs content creation). Establish the snippet sourcing strategy before writing the first tutorial.

---

### Pitfall 7: Playground State Management Performance -- Context Re-render Cascade

**What goes wrong:**
The current playground uses a single `AppState` context with `useReducer`. Every state change dispatches a new state object. All context consumers re-render because React Context does not do selective re-rendering -- any consumer of `AppStateContext` re-renders when ANY field in the state changes.

With the current components consuming `AppState` (ProviderSelector, SchemaEditor, MockTestSection, ActionBar, ResponseViewer, all Tab components, StatusBar), a single keystroke in Schema Editor dispatches `UPDATE_SCHEMA`, causing ALL components to re-render. That is 10+ unnecessary re-renders per keystroke.

The existing code already splits context into `AppStateContext` and `AppDispatchContext` (good practice), but the state value itself is not split. As the playground grows (more features, more state fields), this re-render overhead becomes visible as input lag in the Schema Editor.

**Why it happens:**
For a minimal debug tool with simple state (~20 fields), a single context is fine. The playground upgrade plan (more tabs, more features, connection status, responsive layout state) will add more state fields. Each new field makes the re-render cascade worse.

**How to avoid:**
Three strategies, from simplest to most robust:

1. **Split state into multiple contexts (recommended for this phase).** Create separate contexts for different domains:
   ```typescript
   // ProviderContext -- providers, selectedProviderId
   // SchemaContext -- schema, schemaValid
   // ExecutionContext -- negotiationResult, executionResult, timing
   // UIContext -- activeTab, status, panelWidths
   // LogContext -- logs, errors
   ```
   Components subscribe only to the contexts they need. SchemaEditor uses only `SchemaContext`. This eliminates 90% of unnecessary re-renders.

2. **Use `React.memo` on leaf components.** Wrap `ProviderCard`, tab components, etc. with `React.memo`. This helps less than context splitting since context always creates new object references.

3. **Worst case: switch to Zustand or Jotai.** These atomic state libraries subscribe at the field level. Most performant but adds a dependency. Defer unless profiling proves it necessary.

**Warning signs:**
- Typing in Schema Editor feels sluggish on a modern machine (M-series Mac)
- React DevTools "Profiler" shows 10+ components re-rendering on a single keystroke
- Flame graph shows `AppStateContext.Provider` as a re-render bottleneck
- Tab switching feels slow (each tab mount triggers cascade re-renders)

**Phase to address:**
Phase 2 (Playground upgrade: state management). Refactor context before adding new features that depend on state.

---

### Pitfall 8: Playground Scope Creep -- Debug Tool Turning Into Admin Console

**What goes wrong:**
The playground starts as a Schema negotiation debug tool (three panels: select provider, edit schema, view response). During the upgrade, features creep in: mock test history, API key configuration UI, billing usage display, provider performance comparison, schema library, saved test scenarios.

Before long, the playground becomes a 50-component mini-portal. The original purpose ("quickly test a Schema against a Provider") is buried under nav bars and settings panels. Development time on the playground approaches time spent on core library features.

This is particularly dangerous because the playground is a "visible" deliverable. There is pressure to make it polished and feature-rich. The speculation that it might become a demo tool, onboarding tool, QA tool, and sales tool all at once is never formally rejected.

**Why it happens:**
The playground sits at the intersection of multiple user needs:
- **Pack developers** want to see raw negotiation internals
- **Agent integrators** want to test schemas quickly
- **Project contributors** want a debugging dashboard
- **Potential users** evaluate the project through the playground

Everyone wants "one more feature." The spec (playground-ui-spec.md) explicitly lists non-goals ("no API Server graphical replacement", "no production monitoring dashboard") but these boundaries are easy to cross during implementation.

**How to avoid:**
1. **Enforce the non-goals list as a code review gate.** Every playground PR must be checked: "Does this implement a non-goal?" Mock test history? Yes (it is debugging). API Key management UI? No (that is vault module's job). Billing dashboard? Absolutely not (there is `synapse billing status` for that).

2. **Define a "stop adding features" threshold.** The playground has 15 components. Set a hard limit (e.g., 25 components). When the limit is reached, no new features -- only refinements.

3. **Write acceptance criteria for each feature before implementation.** One sentence format: "User: [persona]. Goal: [single action]. Success: [observable outcome]." If a feature cannot be described in one sentence, it is too complex.

4. **The playground is NOT the onboarding experience.** The getting-started guide (in Docusaurus) is where new users learn. The playground is for people who already understand the concepts and need to test.

5. **Track playground LOC growth.** If playground code grows faster than core library code across milestones, that is a red flag.

**Warning signs:**
- Playground PR title says "Add [feature] page" (pages = app, not tool)
- Playground imports routing libraries (react-router)
- Playground has user authentication or login screen
- Playground LOC exceeds 5000 (currently ~1500 across 15 files)
- PR adds a "Settings" page or "Preferences" panel
- Developer says "while we are at it, let us also add..."

**Phase to address:**
Phase 1 (playground requirements). The scope definition must be explicit in the requirements doc before any implementation.

---

### Pitfall 9: Documentation Site and Playground Competing for the Same Release

**What goes wrong:**
The v4.0 milestone defines two major deliverables: the documentation site (apps/docs/) AND the playground upgrade (apps/playground/). These are fundamentally different work streams:
- **Docs site:** Content-driven. Requires writing, reviewing, structuring information. Risk is "under-scoped" (looks done but has no real content).
- **Playground:** Engineering-driven. Requires React components, state management, API integration. Risk is "over-scoped" (keeps growing in scope).

When both are in the same milestone, one inevitably gets 80% of the attention while the other stalls. Documentation gets deprioritized because "code is more important." The milestone completion depends on BOTH being done, creating a dependency bottleneck.

**Why it happens:**
Both are "front-end" deliverables that naturally group together in milestone planning. The assumption is: "phase 13 = docs, phase 14 = playground, combine into one milestone." But they require different skills (technical writing vs. React engineering), different review cycles (content review vs. code review), and different quality criteria (information accuracy vs. interaction polish).

**How to avoid:**
1. **Treat them as parallel, independent phases, not sequential.** Do not block one on the other. The milestone is complete when EITHER ships. The other follows in a subsequent milestone.

2. **Assign different reviewers.** Docs should be reviewed by someone who uses the product. Playground should be reviewed by core engineers. Do not have the same person approve both.

3. **Set separate done-dates.** If the milestone timeline is 3 weeks: docs by week 2, playground by week 3. Docs team does not wait for playground feature freeze.

4. **If resources are limited, prioritize docs.** A documentation site with good content but basic design is valuable. A playground with beautiful UI but no docs to explain how to use the product has limited reach.

**Warning signs:**
- Milestone tracking shows one workstream at 90% and the other at 20%
- PRs are all playground features, no doc PRs
- "Docs content" is a single issue that nobody is assigned to
- The milestone slips multiple times because "we need to finish the playground first"
- The docs site ships with placeholder "TODO" content

**Phase to address:**
Phase 1 (milestone planning). Separate the two workstreams in the milestone definition. Establish parallel execution from day one.

---

### Pitfall 10: Custom Resizable Panels Edge Cases -- Layout Breakage

**What goes wrong:**
The playground's three-panel layout uses hand-written resizable panels (`App.tsx` and `ResizablePanel.tsx`). The implementation attaches global `mousemove` and `mouseup` event listeners to `document`. Edge cases:

1. **Mouse leaves the browser window during drag.** `mouseup` never fires on `document`. The panel remains in "dragging" state with `user-select: none` on body. User must click again to "release."

2. **Touch devices.** The playground targets 1440px+, but trackpads generate `touchmove` events, not `mousemove`. The divider is entirely non-functional on touch devices.

3. **Content overflow.** When center panel is resized to minimum (400px) and Schema Editor has long lines, CodeMirror does not reflow. Inconsistently applied overflow causes some panels to clip content while others scroll.

4. **Iframe boundaries.** If the playground is embedded in an iframe, mousemove events do not fire outside the iframe.

**Why it happens:**
Hand-written resizable panels seem simple -- just track mouse position and update CSS grid columns. The edge cases only appear in specific environments. The developer always tests on their own machine.

**How to avoid:**
1. **Add `mouseleave` fallback.** Listen for `mouseleave` on `document.documentElement` to cancel the drag.

2. **Add touch event support.** Handle both mouse and touch events using `touch.clientX` instead of `e.clientX`.

3. **Consider `react-resizable-panels` for production quality.** The spec rejects this library ("simple drag does not need full library") but the cost of handling all edge cases manually often exceeds the library size (~5KB gzipped). Either accept the edge cases as documented constraints OR use the library. Half-measures create a worse experience than choosing either extreme.

4. **Apply consistent overflow behavior.** All panels should use `overflow-hidden` at panel level and `overflow-auto` at content level.

**Warning signs:**
- User reports: "dragging the divider stops working if I move my mouse too fast"
- User reports: "the divider does nothing on my laptop trackpad"
- Code review: global event listeners are attached but never cleaned up on `mouseleave` or `blur`
- Playground layout breaks on window resize after divider drag

**Phase to address:**
Phase 2 (Playground upgrade: layout enhancement). Edge cases should be addressed as part of the layout rework.

---

### Pitfall 11: Docusaurus TailwindCSS Conflict with Infima

**What goes wrong:**
If TailwindCSS is added to Docusaurus (commonly via `docusaurus-tailwindcss-loader` or PostCSS plugin), the Tailwind preflight (CSS reset) conflicts with Docusaurus' built-in Infima styles:

- Tailwind's `@layer base` reset sets `box-sizing: border-box`, `margin: 0` on all elements. Infima has its own reset. The two fight.
- Heading sizes become unpredictable (Infima h1 vs Tailwind reset)
- Button styles double-apply (Tailwind `.btn` vs Infima `.button`)
- Spacing utilities conflict (Infima `--ifm-spacing` vs Tailwind `p-4`)
- Code block styling breaks (Infima code theme vs Tailwind `font-mono`)

**Why it happens:**
The developer is used to Tailwind for the playground and wants the same utility classes in Docusaurus custom pages. Adding Tailwind PostCSS to Docusaurus is a well-known community pattern. It works initially, then subtle style conflicts appear as more content is added.

**How to avoid:**
1. **Do NOT add TailwindCSS to Docusaurus.** Docusaurus' Infima is designed for content-heavy documentation sites. Use Docusaurus' built-in `customCss` option for minor customizations.

2. **If you MUST use Tailwind (e.g., for a custom homepage):**
   - Scope Tailwind to a specific `@layer` and only apply within a specific CSS class container
   - Use `corePlugins: { preflight: false }` in Tailwind config to disable the reset
   - Test every Docusaurus component (headings, tables, code blocks, admonitions, nav) for style regressions
   - This is HIGH maintenance -- expect breakage on every Docusaurus upgrade

3. **Use Infima CSS variables for theming instead:**
   ```css
   :root {
     --ifm-color-primary: #2563eb;
     --ifm-color-primary-dark: #1d4ed8;
     --ifm-navbar-background-color: #0f172a;
   }
   ```

**Warning signs:**
- `docusaurus.config.ts` imports `tailwindcss` PostCSS plugin
- `apps/docs/package.json` has `tailwindcss` as a dependency
- Custom Docusaurus pages use `class="text-blue-400"` (Tailwind classes in Docusaurus context)
- A Docusaurus upgrade breaks the layout (sign of CSS dependency conflict)

**Phase to address:**
Phase 1 (docs scaffolding). The CSS strategy must be decided when creating `apps/docs/`.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hand-written API docs (no TypeDoc) | Faster initial docs -- no plugin setup cost | Every API change requires manual doc update; docs go stale | NEVER. TypeDoc setup takes 1 hour and pays for itself after first API change. |
| Single AppState context (no split) | Simple state model, one file to maintain | Re-render cascade degrades UX as playground grows | For MVP only (< 15 components). Must be split before adding more features. |
| No Vite proxy for API (hardcoded localhost) | Zero config, works immediately in dev | Production builds are broken | NEVER for deployable apps. Acceptable only for local-only dev tools. |
| Docusaurus default theme (no customization) | Zero CSS work, looks professional | Site looks generic | For MVP. Add custom branding later. Do NOT start with custom themes. |
| Inline code examples in docs | Easy to write, no tooling needed | Examples go stale silently | For tutorial/conceptual content ONLY. Never for API reference. |
| Relying on `docusaurus clear` for build issues | Quick fix | Masks underlying config problems | Acceptable during development. Must have reproducible builds in CI. |
| Playground components without `React.memo` | Faster to write | Unnecessary re-renders on state change | For leaf components. Profile first. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Docusaurus + pnpm monorepo | Using `create-docusaurus` inside existing monorepo (creates conflicting config) | Scaffold manually: create `apps/docs/`, install via pnpm workspace, configure `docusaurus.config.ts` from scratch |
| Docusaurus + workspace packages | Importing from `@synapse-router/*` in MDX without the packages as dependencies | Add workspace packages as explicit dependencies: `"@synapse-router/core": "workspace:*"` |
| docusaurus-plugin-typedoc + monorepo | Pointing `entryPoint` to `packages/core/src/index.ts` with wrong relative path | Use `../../packages/core/src/index.ts`. Must specify `tsconfig` explicitly. |
| Playground + API server in CI | Building playground without API server running | Add CI step: start API server, build playground, kill API server |
| Vite + CodeMirror dynamic imports | Importing CodeMirror synchronously, adding ~300KB to initial bundle | Use dynamic imports for tab-based editors. Only SchemaEditor needs eager loading. |
| Docusaurus + analytics | Adding tracking during initial setup | Add analytics only when site has measurable traffic. Not a Phase 1 requirement. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Multiple CodeMirror instances (3+) | Page load > 2s, tab switch lag | Lazy-init editors per tab; use `<pre>` for read-only | 4+ instances on mid-range machine |
| Single context re-render cascade | Input lag in Schema Editor | Split context into domains before adding more features | 30+ state fields, 15+ components |
| Docusaurus webpack build on every CI run | CI build time 2x longer | Isolate docs build into separate CI job | On every PR CI run |
| Docusaurus with many versioned docs | Build time proportional to versions | Keep versions < 3. Archive old versions. | 5+ versions |
| `pnpm build -r` with both Vite and webpack | Memory spikes | Run builds sequentially in CI | CI runners < 4GB RAM |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing API server URL in playground build | Users discover internal endpoints | Use Vite proxy with relative paths |
| Storing API keys in playground state or localStorage | Key exfiltration via XSS | Playground should never handle API keys. Keys managed via `synapse vault`. |
| Docs site leaking internal architecture | Competitors learn system boundaries | Review content before publication. Use user-facing names in URLs. |
| Docusaurus build output containing source maps | Source maps expose TypeScript internals | Ensure production mode. Check `build/` for `.map` files. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Playground loads empty with no explanation | User assumes the tool is broken | Show skeleton loaders and help text |
| API connection failure is silent | User gets no feedback on failed fetch | Add connection indicator in StatusBar |
| CodeMirror has no copy/paste affordances | User types JSON manually | Show placeholder: "Paste your Agent Schema here..." |
| Docs search returns no results | User leaves, cannot find what they need | Configure Algolia DocSearch from day one (free for open source) |
| Docs shows unversioned "latest" | User reads feature removed in current version | Use versioning for major releases. Show version badge. |
| Playground tabs have no empty state | Blank white space | Each tab: "Run Negotiate to see formatted results" |
| Responsive breakage at 1024-1440px | Content clipped or overlapping | Test at every common resolution. Implement spec's responsive rules. |

## "Looks Done But Is Not" Checklist

- [ ] **API reference generation**: TypeDoc + docusaurus-plugin-typedoc is NOT configured in `apps/docs/` -- verify typedoc plugins are devDependencies and configured
- [ ] **Production API proxy**: Playground `vite.config.ts` has NO proxy configuration -- verify `/api` proxy is configured
- [ ] **Responsive layout**: Playground has NO responsive behavior below 1440px -- verify spec layouts are implemented
- [ ] **Context splitting**: AppState is still a single context -- verify it is split or profile-verified as non-bottleneck
- [ ] **CodeMirror lazy-init**: Tab-based CodeMirror instances eagerly initialized -- verify lazy-init + destroy-on-hide
- [ ] **Playground scope boundaries**: Non-goal features being added -- verify non-goals list is enforced in code review
- [ ] **Docs build isolation**: Root `pnpm build` does NOT trigger Docusaurus build -- verify separate build script
- [ ] **Tailwind in Docusaurus**: `apps/docs/` has tailwindcss as dependency -- verify Docusaurus uses Infima only
- [ ] **CLI docs from source**: CLI examples are hand-written -- verify a mechanism keeps them in sync
- [ ] **Code snippet validation**: TS code blocks not type-checked -- verify CI step or documented policy

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Stale hand-written API docs | HIGH -- each package needs audit | 1. Implement TypeDoc. 2. Generate full output. 3. Replace hand-written pages. 4. Add CI gate. |
| Production playground broken (localhost) | MEDIUM -- one file change | 1. Add Vite proxy. 2. Change api.ts to relative URLs. 3. Test production build. |
| CodeMirror performance issues | HIGH -- may require state re-architecture | 1. Profile. 2. If re-render: split context. 3. If editor: lazy-init + destroy. |
| Docusaurus v3 to v4 migration | MEDIUM -- 1-2 days planned | 1. Run migration tool. 2. Update config. 3. Regenerate TypeDoc. 4. Update CI. |
| Playground scope creep | HIGH -- hard to remove features | 1. Feature audit. 2. Label core vs creep. 3. Move creep features to experimental. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| P1: Bundler conflict (webpack vs Vite) | Phase 1 (docs scaffolding) | Root `pnpm build` does NOT include docs; docs has own `build:docs` script |
| P2: API docs going stale | Phase 1 (docs scaffolding) | TypeDoc plugins installed and configured for at least `@synapse-router/core` |
| P3: Docusaurus v4 migration pain | Phase 1 (architecture decision) | No custom webpack plugins, no swizzled components |
| P4: CodeMirror multi-instance performance | Phase 2 (playground tab enhancement) | Read-only tabs use `<pre>` not CodeMirror; editors lazy-init |
| P5: API endpoint hardcoding in production | Phase 1 (playground infrastructure) | `api.ts` uses relative `/api` prefix; proxy configured; production build tested |
| P6: Docs code snippets out of sync | Phase 1 (docs content creation) | Snippet sourcing strategy documented; TypeDoc API reference separate |
| P7: Context re-render cascade | Phase 2 (playground state management) | AppState context split or profile-verified under threshold |
| P8: Playground scope creep | Phase 1 (requirements definition) | Non-goals enforced in code review; component cap set |
| P9: Docs and playground competing | Phase 1 (milestone planning) | Two workstreams parallel, not sequential; different reviewers |
| P10: Custom resizable panel edge cases | Phase 2 (playground layout) | Mouseleave, touch, overflow handled; or using library |
| P11: Tailwind conflict with Infima | Phase 1 (docs scaffolding) | Docusaurus does NOT have tailwindcss dependency |

## Sources

- **Docusaurus v3.10.x official documentation**: `https://docusaurus.io/docs/installation` -- Installation guide, monorepo notes, React prerequisites. v3.7.0+ supports React 19. (HIGH confidence)
- **Docusaurus v4 umbrella issue**: `https://github.com/facebook/docusaurus/issues/11719` -- slorber's v4 planning. Filed Feb 2026. (HIGH confidence)
- **Docusaurus React 19 support**: v3.7.0 release (2025-01-03): "feat: Add React 19 support to Docusaurus v3." (HIGH confidence)
- **docusaurus-plugin-typedoc**: `https://typedoc-plugin-markdown.org/plugins/docusaurus` -- TypeDoc + Docusaurus integration for generated API docs. (MEDIUM confidence -- from README)
- **Codebase analysis -- current playground**: `apps/playground/src/` -- 15 components, single context, custom panels, CodeMirror. (HIGH confidence)
- **Codebase analysis -- API client**: `apps/playground/src/lib/api.ts` -- Hardcoded `localhost:3000`. (HIGH confidence)
- **Playground UI spec**: `knowledge/05-UIUX设计/playground-ui-spec.md` -- Design spec v0.1.0. (HIGH confidence)
- **Docusaurus versioning pitfalls**: `https://docusaurus.io/docs/versioning` -- Avoid unless necessary; <10 versions recommended. (HIGH confidence)
- **Docusaurus deployment pitfalls**: `https://docusaurus.io/docs/deployment` -- Netlify Pretty URLs, GitHub Pages `.nojekyll`. (HIGH confidence)
- **Docusaurus search**: `https://docusaurus.io/docs/search` -- Algolia DocSearch recommended; common index issues. (HIGH confidence)
- **Docusaurus i18n**: `https://docusaurus.io/docs/i18n/introduction` -- Designed to be added later. (HIGH confidence)

---
*Pitfalls research for: Docusaurus documentation site (apps/docs/) + Playground UI upgrade (apps/playground/) -- v4.0 Documentation & Playground milestone*
*Researched: 2026-05-21*
