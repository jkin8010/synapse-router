# Feature Research: Documentation Site + Playground UI Upgrade

**Domain:** Developer documentation site (Docusaurus) + Playground UI enhancement
**Researched:** 2026-05-21
**Confidence:** HIGH

## How This Research Was Conducted

- Read the existing playground source code (13 components, 4 hooks, context/api layer) to establish the current state
- Read the existing playground-ui-spec.md to understand the planned design
- Read existing knowledge files (usage-guide, architecture, product-vision) for documentation content inventory
- Analyzed CLI tool documentation sites for patterns (Azure CLI, Biome, npm docs, Astro docs)
- Analyzed API playground designs for layout patterns and interaction flows
- High confidence because existing specs, code, and content inventory were examined directly

## Documentation Site (apps/docs/)

### Table Stakes

Features users expect. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Getting Started guide** | Every dev tool needs a 5-minute "install and run" path. Missing this = project is not ready for use. | LOW | Content already exists in `knowledge/01-产品规划/synapse-router-usage-guide.md` -- needs reformatting for Docusaurus |
| **CLI command reference** | CLI tool users expect every command/subcommand documented with options, examples, and defaults. | MEDIUM | ~15 commands (connect, setup, config, vault, lock, sdk, pack, billing, route, evolve, smoke, serve, mcp, provider, negotiate). Content partially exists in CLAUDE.md |
| **Search** | Developer docs without search are effectively invisible to users who don't know the exact page. | LOW | Docusaurus built-in search (via Algolia DocSearch or local search plugin) |
| **Mobile-responsive layout** | More developers reference docs on mobile than most projects assume. | LOW | Docusaurus responsive by default |
| **API reference** | HTTP API users need endpoint documentation with request/response schemas. | LOW | Content exists in `docs/API.md` -- reformat for Docusaurus |
| **Pack development guide** | Users writing custom Provider Packs need the schema and conventions documented. | MEDIUM | Content exists in `docs/PACKS.md` -- reformat and cross-link |
| **Versioned docs** | Users on older releases need corresponding docs without guessing. | MEDIUM | Docusaurus versioned docs plugin; versions map to npm tags |
| **404 page / redirects** | Renamed/removed pages should redirect to avoid broken bookmarks. | LOW | Docusaurus supports redirects plugin |

### Differentiators (Competitive Advantage)

Features that set the product apart.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Live TypeScript types from source** | API reference auto-generated from TypeScript source types via typedoc-plugin-markdown + Docusaurus. Eliminates doc-code drift. | HIGH | Requires typedoc + docusaurus-plugin-typedoc integration; types are in `packages/core/src/` |
| **Embedded playground in docs** | "Try it now" interactive schema negotiation editing directly in docs pages, reducing context switching. | HIGH | Need to create an iframe-able or web component version of the playground |
| **Visual flow diagrams** | SVG/Mermaid diagrams showing the negotiate-lock-execute pipeline make architecture intuitive. | LOW | Docusaurus supports Mermaid natively via `mdx` + mermaid plugin |
| **Interactive CLI examples** | Copy-paste-able command blocks with real output shown; tabbed examples for different Providers. | LOW | Docusaurus tabs plugin; content already exists in CLAUDE.md and usage-guide.md |
| **Pack DSL schema docs as searchable pages** | The DSL spec lives in `knowledge/04-技术架构/synapse-router-dsl-spec.md` -- extracting to searchable docs pages makes it discoverable. | MEDIUM | Requires creating ~5-10 pages from the DSL spec |
| **Changelog as dedicated section** | Every release listed with breaking changes, new features, and migration notes in reverse chronological order. | LOW | Docusaurus blog plugin works for changelogs |

### Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Separate blog** | Early-stage project docs need focus on reference, not marketing posts. Blog requires ongoing content production. | Changelog section only; blog can be added post-launch |
| **Multi-language i18n** | Premature. At this stage, the developer base is primarily Chinese + English bilingual. Translating every page doubles maintenance cost. | Write all docs in English (matching code conventions); Chinese companion pages for key concepts only if needed |
| **Video tutorials** | Video content is high-effort and goes stale with API changes. Text + code blocks are version-controllable. | Animated SVG diagrams for complex concepts instead |
| **Community forum / comments** | Requires moderation infrastructure and ongoing content monitoring. | GitHub Discussions link in footer |
| **Full interactive tutorial (learn-by-doing)** | Building a structured tutorial with step validation is significant work. | Getting Started guide with step-by-step commands (copy-paste) |

### Feature Dependencies

```
[Docusaurus site scaffold]
    └──requires──> pnpm workspace add @synapse-router/docs
    └──requires──> docusaurus.config.js setup
    └──requires──> sidebars.js configuration

[Versioned docs]
    └──requires──> Docusaurus site scaffold
    └──requires──> Version tagging convention (matches npm)

[Auto-generated TypeScript API reference]
    └──requires──> typedoc + docusaurus-plugin-typedoc
    └──requires──> package.json typedoc config for packages/core
    └──requires──> Stable TypeScript type exports in packages/core

[Embedded playground in docs]
    └──requires──> apps/playground exists and is buildable
    └──requires──> iframe wrapper component
    └──enhances──> Cross-linking between docs and playground

[CLI command reference pages]
    └──requires──> Content extraction from CLAUDE.md
    └──requires──> One page per command or grouped pages

[Getting Started guide]
    └──requires──> Content adaptation from usage-guide.md
    └──requires──> Verified install instructions (pnpm link --global)

[Pack development guide]
    └──requires──> Content adaptation from docs/PACKS.md
    └──requires──> DSL spec extraction from knowledge/

[Changelog]
    └──requires──> Git history traversal for release notes
```

### Documentation Site Content Inventory

Below is the existing content that maps to Docusaurus pages, with the source location and recommended target:

| Source | Target Docusaurus Page | Work Required |
|--------|----------------------|---------------|
| `knowledge/usage-guide.md` sec 1-3 | `/getting-started/` | Adapt to English-only; update CLI output examples |
| `knowledge/usage-guide.md` sec 4 | `/core-concepts/` | Split into concepts (schema lock, negotiation, pack) |
| `knowledge/usage-guide.md` sec 5-10 | `/guides/` | Various guide pages |
| `knowledge/usage-guide.md` sec 11 | `/reference/glossary` | Format as glossary |
| `CLAUDE.md` CLI section | `/reference/cli/` | Page per command; extract from CLAUDE.md |
| `docs/API.md` | `/reference/api/` | Reformat with Docusaurus code blocks |
| `docs/PACKS.md` | `/guides/pack-development/` or `/reference/packs/` | Minor reformatting |
| `knowledge/architecture.md` | `/architecture/` | Format with Mermaid diagrams |
| `knowledge/product-principles.md` | `/overview/principles` | Single page, light formatting |
| `knowledge/dsl-spec.md` | `/reference/dsl/` | Split into multiple pages by topic |
| Git log | `/changelog/` | Auto-generated or manual curation |
| - | `/troubleshooting/` | New content needed (common errors, FAQ) |

## Playground Upgrade (apps/playground/)

### Current State (Already Implemented)

The following features from `knowledge/05-UIUX设计/playground-ui-spec.md` are already built:

- 3-column layout with resizable panels (grid + mouse drag)
- ProviderSelector with ProviderCard (selection, feature badges, feature count, base_url, selected state)
- SchemaEditor with CodeMirror 6 (JSON syntax highlight, lint, fold, load/save/clear)
- ActionBar with Negotiate/Execute/Mock Test buttons + loading states
- MockTestSection (collapsible, CodeMirror for mock JSON, Run Mock Test button, pass/fail results)
- ResponseViewer with 6 tabs (Formatted, Raw JSON, Logs, Errors, TypeScript, Python)
- StatusBar (status dot, provider, schema validity, version)
- Dialog component (native `<dialog>` + backdrop)
- Error handling (codes, structured error objects)
- Timing display for negotiate duration
- Base URL override per provider
- File load/save for schema JSON
- Context + useReducer state management (no external library)

### Table Stakes

Features that should ship with the upgrade. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Responsive layout** | Spec requires 3 breakpoints (>1440px full, 1024-1440px collapsible left panel, <1024px stacked tabs). Only the full layout is currently implemented. | MEDIUM | The grid layout currently has no responsive fallback |
| **Add Pack dialog** | Spec includes an "Add Pack" button in the provider header that opens a dialog for pack path input or file selection. Button exists but dialog is not implemented. | LOW | Use existing Dialog component |
| **Provider card key status** | Cards should show "no key configured" for providers without vaulted keys. Currently shows hardcoded `isConfigured={true}`. | LOW | Check vault for key presence per provider |
| **Disabled button tooltips** | Spec requires tooltips on disabled buttons ("Schema contains errors", "Select a provider first"). Currently buttons are disabled without explanation. | LOW | CSS `group-hover` tooltip pattern (spec appendix B) |
| **Mock test auto-template** | Mock Response Editor should auto-populate based on selected provider's output schema. Currently uses a hardcoded template. | MEDIUM | Derive from provider-card.json feature output_schema |
| **Empty state handling** | "No providers found" page should link to "How to add a pack" help page. Currently a bare `<a>` link with no handler. | LOW | Link to docs site or show instructions inline |
| **Mock test runs full pipeline** | Spec requires mock test to run negotiation + field mapping + verify output. Currently calls the execute API endpoint which may not match spec intent. | MEDIUM | May need a dedicated mock runner endpoint or browser-side evaluation |
| **Negotiation results across provider list** | Users expect to see which providers accept/reject their schema at a glance, not one-at-a-time. Currently requires selecting each provider individually. | HIGH | Requires batch negotiation API or browser-side evaluation for all providers |

### Differentiators (Competitive Advantage)

Features that make the playground a compelling testing tool.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Side-by-side provider comparison** | See negotiation results for all providers simultaneously, sorted by match quality. Dramatically speeds up pack development. | HIGH | New panel mode or right-panel tab; requires batch negotiate endpoint |
| **SDK code auto-update** | TypeScript/Python tabs auto-update when schema changes (without manual re-negotiate). Demonstrates the "evolve" concept visually. | MEDIUM | Debounced (1s) auto-negotiate on schema change when provider is selected |
| **Billing cost preview** | Show estimated cost per call before executing, based on provider pricing. Integrates with @synapse-router/billing. | LOW | Read provider-card.json pricing if available; show in ActionBar or StatusBar |
| **Visual field mapping display** | Show which schema fields mapped to which provider fields, with missing/extra/type-mismatch highlighted. Makes "adapted" negotiation outcomes visual. | MEDIUM | New tab or modal visualization; data already available in negotiation result |
| **Schema presets** | Save frequently used schemas to localStorage with named presets. Quick-switch between "chat", "text-to-image", "embedding" configs. | LOW | Simple localStorage key-value with preset picker dropdown |
| **Request history** | Show recent negotiate/execute runs with timestamps, results, and ability to re-run. Debugging aid. | MEDIUM | localStorage history (last 20 runs); each run stores schema + provider + result |
| **Mock batch testing** | Run mock tests with multiple mock response files in a single batch, generating a pass/fail matrix. Useful for Pack developers testing edge cases. | HIGH | Requires batch runner; good for Phase 2 upgrade |
| **Keyboard shortcuts** | Cmd+Enter = Execute, Cmd+Shift+Enter = Negotiate, etc. Power users expect this in dev tools. | LOW | `useEffect` with global keydown listener |

### Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Full API Key management UI** | Vault is a CLI responsibility. Managing keys in the browser adds security surface (XSS exposure) and implies browser-side decryption which is architecturally wrong. | Keep vault operations in CLI; playground reads only key "presence" status from API |
| **Real-time monitoring dashboard** | That is a production concern. Playground is a development-time tool. Metrics belong in a separate observability system. | Status bar shows timing; structured logs tab for debugging |
| **Collaboration (share/export tests)** | Multi-user features are infrastructure-heavy. At this stage, playground is single-user per browser tab. | Export/import test scenarios as JSON files (current Load/Save is sufficient) |
| **Custom theme builder** | The dark theme is established. Theme switching adds CSS variable overhead for minimal value. | Focus on dark theme polish (readability, contrast) |
| **History sync across devices** | Requires backend infrastructure. Out of scope for a dev tool. | localStorage-only history; clear on request |
| **Full Schema editor with drag-and-drop** | Building a visual schema builder is a separate product. CodeMirror JSON + validation is the right level of abstraction for a dev tool. | Improve CodeMirror experience (in-editor schema validation, auto-completion) |
| **Alternative LLM models for mock responses** | Mock test is about deterministic schema validation, not about generating fake LLM responses. | Mock response is user-provided JSON |

### Feature Dependencies

```
[Responsive layout]
    └──requires──> Refactor grid to support collapsible left panel
    └──requires──> Add stacking layout for <1024px
    └──requires──> Tab bar for panel switching in stacked mode

[Add Pack dialog]
    └──requires──> Existing Dialog component (already done)
    └──requires──> API endpoint or browser-side pack loading

[Side-by-side provider comparison]
    └──requires──> Batch negotiation (API endpoint or browser-side evaluation)
    └──requires──> New view mode (comparison table or split panels)

[SDK code auto-update]
    └──requires──> Re-negotiation on schema change
    └──requires──> Debounce logic (1s)
    └──requires──> Avoid auto-negotiate during manual editing

[Billing cost preview]
    └──requires──> Provider card has pricing data (or billing module exists)
    └──requires──> Negotiation result includes feature-level cost info

[Visual field mapping]
    └──requires──> Negotiation result includes per-field mapping data (already in ManifestMatchResult)

[Schema presets]
    └──requires──> localStorage utility
    └──requires──> Preset picker component

[Request history]
    └──requires──> localStorage utility
    └──requires──> History panel or tab
    └──enhances──> Re-run from history entry

[Mock batch testing]
    └──requires──> Mock test infrastructure
    └──requires──> Result matrix component
    └──enhances──> CSV/JSON result export

[Keyboard shortcuts]
    └──requires──> useKeydown hook
    └──depends──> Shortcut documentation

[Provider card key status]
    └──requires──> API endpoint: GET /vault/keys (exists) or GET /providers/:id/status
    └──requires──> State update on provider load
```

## Combined MVP Definition

### Launch With (v1) -- Documentation Site

The minimum viable documentation site that makes the project usable by new developers.

- [ ] **Docusaurus site scaffold** -- `apps/docs/` with proper config, sidebar, nav bar, footer, search
- [ ] **Getting Started guide** -- Installation, first connect, basic concepts (adapted from usage-guide.md)
- [ ] **CLI command reference** -- All ~15 commands documented with options table and examples (adapted from CLAUDE.md)
- [ ] **Core concepts** -- Schema Negotiation, Schema Lock, Provider Pack, SDK Generation as 4 dedicated pages
- [ ] **HTTP API reference** -- Endpoint documentation with request/response schemas (adapted from docs/API.md)
- [ ] **Pack development guide** -- Pack structure, provider-card.json schema, DSL format (adapted from docs/PACKS.md)
- [ ] **Glossary** -- Definition of all domain terms (adapted from usage-guide.md sec 11)
- [ ] **Changelog page** -- Current release notes from git history
- [ ] **Mobile responsive** -- Default Docusaurus responsive layout is sufficient

### Add After Validation (v1.x) -- Documentation Site

- [ ] Auto-generated TypeScript API reference (typedoc integration) -- validates when users need to understand core types
- [ ] Architecture diagrams (Mermaid) -- validates when users ask "how does it work?"
- [ ] Versioned docs -- validates when multiple major versions are in use
- [ ] Embedded playground in docs -- validates when users want to try before installing
- [ ] Troubleshooting / FAQ page -- validates from support questions

### Launch With (v1) -- Playground Upgrade

The minimum viable playground upgrade. These are the highest-value, lowest-effort improvements.

- [ ] **Responsive layout** -- Implement collapsible left panel (1024-1440px) and stacked view (<1024px). This is a spec gap the current code has.
- [ ] **Add Pack dialog** -- Wire up the existing "+ Add" button to open the native dialog for pack path input
- [ ] **Disabled button tooltips** -- Add `title` attributes and/or CSS tooltip on Negotiate/Execute/Mock Test when disabled
- [ ] **SDK code auto-update** -- Auto-renegotiate on schema change (debounced 1s, only when provider is selected). This showcases the core value proposition.
- [ ] **Schema presets** -- 3 built-in presets (Chat, Text-to-Image, Embedding) + save/load from localStorage. Lowers friction for repeated testing.
- [ ] **Billing cost preview** -- Show estimated cost in ActionBar or StatusBar after negotiate completes (if provider has pricing data)
- [ ] **Provider card key status** -- Fetch key presence from vault API; show "not configured" vs "configured" state
- [ ] **Keyboard shortcuts** -- Cmd+Enter = Execute, Cmd+Shift+Enter = Negotiate

### Add After Validation (v1.x) -- Playground Upgrade

- [ ] Side-by-side provider comparison -- validates when users need to compare many providers
- [ ] Request history -- validates from developer feedback ("I wish I could see what I ran 5 minutes ago")
- [ ] Visual field mapping display -- validates when Pack developers struggle to debug field mappings
- [ ] Mock test runs full pipeline (browser-side) -- validates when mock test results don't match real negotiate behavior
- [ ] Mock batch testing -- validates when Pack maintainers need regression testing

### Future Consideration (v2+)

- TypeScript API reference auto-generation from source code
- Embedded playground iframe in docs
- Request/response history sync via API server
- Shared playground scenarios (export/import URLs)

## Feature Prioritization Matrix

### Documentation Site

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Docusaurus scaffold + Getting Started | HIGH | LOW (content exists) | P1 |
| CLI command reference | HIGH | MEDIUM (15 commands, extract from CLAUDE.md) | P1 |
| Core concepts (4 pages) | HIGH | LOW (content exists in usage-guide.md) | P1 |
| HTTP API reference | MEDIUM | LOW (content exists in docs/API.md) | P1 |
| Pack development guide | MEDIUM | LOW (content exists in docs/PACKS.md) | P1 |
| Glossary | MEDIUM | LOW (content exists) | P1 |
| Search | HIGH | LOW (Docusaurus default) | P1 |
| Changelog | MEDIUM | LOW (git log) | P1 |
| Mobile responsive | MEDIUM | LOW (Docusaurus default) | P1 |
| Architecture diagrams | MEDIUM | MEDIUM (Mermaid creation) | P2 |
| Auto-generated TS API ref | MEDIUM | HIGH (typedoc integration) | P2 |
| Versioned docs | LOW | MEDIUM (version config) | P2 |
| Embedded playground | MEDIUM | HIGH (iframe architecture) | P3 |
| Troubleshooting / FAQ | MEDIUM | MEDIUM (new content) | P2 |

### Playground Upgrade

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Responsive layout | HIGH | MEDIUM (CSS grid refactor) | P1 |
| SDK code auto-update | HIGH | MEDIUM (debounced re-negotiate) | P1 |
| Disabled button tooltips | MEDIUM | LOW (CSS + title attr) | P1 |
| Schema presets | HIGH | LOW (localStorage + 3 presets) | P1 |
| Provider card key status | MEDIUM | LOW (API call + state) | P1 |
| Keyboard shortcuts | MEDIUM | LOW (keydown listener) | P1 |
| Add Pack dialog | MEDIUM | LOW (uses existing Dialog) | P1 |
| Billing cost preview | MEDIUM | LOW (read pricing from provider) | P2 |
| Side-by-side comparison | HIGH | HIGH (new view mode) | P2 |
| Visual field mapping | MEDIUM | MEDIUM (new tab) | P2 |
| Request history | MEDIUM | MEDIUM (localStorage) | P2 |
| Mock test full pipeline | MEDIUM | MEDIUM (API or browser runner) | P2 |
| Mock batch testing | LOW | HIGH (runner + matrix) | P3 |

**Priority key:**
- P1: Must have for launch (documentation site + playground MVP)
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

### Documentation Site

| Feature | Biome | Azure CLI | npm Docs | Our Approach |
|---------|-------|-----------|----------|--------------|
| Getting Started tabbed install | npm/pnpm/bun/yarn/ded | Platform tabs (Win/Mac/Linux) | Single install path | Single pnpm install path (monorepo) |
| CLI reference | Single page, 14 commands | Thousands of commands organized by service | ~70 commands grouped by function | ~15 commands, one page per command group |
| Versioned docs | No (single latest) | Yes (LTS + hybrid + latest) | No | Docusaurus versioned docs plugin |
| Auto-generated API ref | No | No | No | typedoc integration (types from packages/core) |
| Search | Algolia | Microsoft Docs search | Docusaurus built-in | Docusaurus Algolia DocSearch |
| Architecture diagrams | No | Minimal | No | Mermaid diagrams in MDX |
| Interactive examples | No | Azure Cloud Shell | No | CLI examples with real output |
| Embedded playground | No | No | npm Try It | Iframe playground in docs (Phase 2) |

### Playground

| Feature | OpenAI Playground | Anthropic Console | Swagger UI | Our Approach |
|---------|-------------------|-------------------|------------|--------------|
| Schema editor | Text area (no syntax highlight) | Text area | JSON editor | CodeMirror 6 JSON with lint |
| Provider selection | Single (internal switching) | Single (Anthropic only) | Endpoint selection | Multiple provider cards |
| Response viewer | Raw + formatted | Raw only | Raw + pretty | 6-tab viewer (Formatted/Raw/Logs/Errors/SDK) |
| SDK code preview | curl + Python + Node.js | curl + Python | curl | TypeScript + Python (generated from Schema Lock) |
| Mock testing | No | No | Try-it-out (real call) | Mock test with pass/fail validation |
| Cost preview | Yes (token counter) | No | No | Billing cost preview (from provider pricing) |
| History | No | No | No | Request history + presets (Phase 1) |
| Batch testing | No | No | No | Mock batch runner (Phase 2) |
| Side-by-side comparison | No | No | No | Multi-provider comparison (Phase 2) |

Our differentiator: The playground is not an API testing tool -- it is a **Schema negotiation visualization and verification tool**. The core value is showing how Schema Lock works, what field mappings are generated, and what SDK code results. This aligns with the project's "develop-time negotiation" philosophy.

## Sources

- Existing project source code in `apps/playground/src/` (13 components, 4 hooks, context, api client)
- `knowledge/05-UIUX设计/playground-ui-spec.md` -- Playground UI specification (design confirmed, partial implementation)
- `knowledge/01-产品规划/synapse-router-usage-guide.md` -- Existing usage guide content (candidate for docs)
- `docs/API.md` -- Existing REST API reference
- `docs/PACKS.md` -- Existing Pack development guide
- `CLAUDE.md` -- Project root instructions with comprehensive CLI reference
- Docusaurus official documentation (sidebars, docs structure, versioning)
- Biome documentation site (CLI reference pattern)
- Azure CLI documentation (command organization pattern)
- npm documentation site (getting started structure)
- Astro documentation site (sidebar organization pattern)

---
*Feature research for: Docusaurus documentation site + Playground UI upgrade*
*Researched: 2026-05-21*
