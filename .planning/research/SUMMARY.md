# Research Summary

**Project:** Synapse Router
**Domain:** Developer documentation site (Docusaurus) + Playground UI upgrade for AI Agent Schema negotiation tool
**Researched:** 2026-05-21
**Confidence:** HIGH

## Executive Summary

Synapse Router is a develop-time SDK generation engine for AI Agent Provider routing. Adding a documentation site and upgrading the Playground UI are the two major deliverables for the v4.0 milestone. The recommended approach is Docusaurus v3.10.1 for the docs site (React-based, aligns with existing tech stack) with TypeDoc auto-generation for API reference from day one, and a focused Playground UI upgrade that fixes infrastructure issues before adding new features.

## Key Findings

### Recommended Stack

- **Docs:** `@docusaurus/core@^3.10.1` with `@docusaurus/preset-classic`
- **API ref:** `typedoc@^0.28` + `typedoc-plugin-markdown@^4.11` + `docusaurus-plugin-typedoc@^1.4`
- **Playground:** Existing React 19 + Vite 8 + TailwindCSS 4 is sufficient. Add `react-resizable-panels@^4.11.1` for accessible resizable panels. Optional: `lucide-react@^1.16.0` for icons.
- **Deploy:** GitHub Pages via `actions/deploy-pages@v4`
- **Do NOT add:** shadcn/ui, framer-motion, zustand, react-query, react-router (all premature)

### Critical Pitfalls

1. **Bundler conflict (webpack vs Vite):** Docusaurus uses webpack; playground uses Vite 8. Isolate docs build into separate `build:docs` script.
2. **API docs going stale:** Configure typedoc during scaffolding, not deferred.
3. **Production playground broken (hardcoded localhost):** Replace with relative `/api` prefix + Vite proxy. Fix before any UI enhancement.
4. **Playground scope creep:** Enforce non-goals list, 25-component hard limit.
5. **React 18/19 version conflict:** Docusaurus 3.x pins React 18. No shared UI package until React 19 is supported.
6. **Do NOT add TailwindCSS to Docusaurus** (conflicts with Infima). Use built-in `customCss`.
7. **CodeMirror multi-instance performance:** Read-only tabs should use plain `<pre>` or lazy-init patterns.
8. **Single AppState context causes re-renders:** Context splitting into domains should precede feature additions.

### Expected Features

**Documentation site (table stakes):**
- Getting Started guide — content exists in `knowledge/usage-guide.md`
- CLI command reference (~15 commands, from CLAUDE.md)
- Core Concepts (Schema Negotiation, Schema Lock, Provider Pack, SDK Generation)
- HTTP API reference — content exists in `docs/API.md`
- Pack development guide — content exists in `docs/PACKS.md`
- Search (Algolia DocSearch or `@easyops-cn/docusaurus-search-local`)
- Auto-generated TypeScript API reference (typedoc)

**Playground (table stakes):**
- Responsive layout (3 breakpoints)
- Add Pack dialog — button exists, dialog not wired up
- Provider card key status ("no key" vs "configured")
- Disabled button tooltips
- SDK code auto-update (debounced re-negotiate)
- Schema presets (Chat, Text-to-Image, Embedding + localStorage)
- Keyboard shortcuts (Cmd+Enter = Execute)

## Phase Recommendations

| Phase | Name | Description |
|-------|------|-------------|
| 13 | Docs Scaffold + Playground Infra | Docusaurus setup, TypeDoc pipeline, build isolation, Vite proxy |
| 14 | Documentation Site Content | Getting Started, CLI ref, Core Concepts, API ref, Pack guide |
| 15 | Playground Core UI Upgrade | Responsive layout, Add Pack, tooltips, presets, shortcuts |
| 16 | Playground Advanced Features | SDK auto-update, billing preview, field mapping, history |
| 17 | Documentation Polish | Mermaid diagrams, versioned docs, troubleshooting |

The two workstreams (docs and playground) should run in parallel where possible.

---
*Research completed: 2026-05-21*
*Ready for roadmap: yes*
