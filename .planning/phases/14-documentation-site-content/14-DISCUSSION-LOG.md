# Phase 14: Documentation Site Content - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 14-documentation-site-content
**Areas discussed:** Content Structure, Getting Started Format, CLI Format, Code Examples, Cross-References, Doc Language

---

## Content Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Guide + CLI only | DCOC-01 and DCOC-02 only. SDK Guide stays as placeholder. | |
| Fill all 3 sections | Getting Started + full CLI reference + initial SDK Guide. Stretch scope slightly. | ✓ |

**User's choice:** Fill all 3 sections
**Notes:** User wants to fill SDK Guide too, at minimum covering `synapse evolve`. Makes the site more complete.

---

## Getting Started Format

| Option | Description | Selected |
|--------|-------------|----------|
| Single page | One comprehensive file covering install → configure → first connect. | ✓ |
| Multi-page guide | Split into sub-pages: Installation, Configuration, First Connect. | |

**User's choice:** Single page
**Notes:** The existing `intro.md` will serve as both Overview and Getting Started.

---

## CLI Format

| Option | Description | Selected |
|--------|-------------|----------|
| Single page | All commands listed on one page. | |
| Per-command subpages | Each command group gets its own page under docs/cli/. | ✓ |

**User's choice:** Per-command subpages
**Notes:** Better long-term navigability. cli/index.md serves as overview table.

---

## Code Examples

| Option | Description | Selected |
|--------|-------------|----------|
| Rich examples | Full JSON, real provider IDs, copy-pasteable. | ✓ |
| Minimal examples | One concise example per command. | |
| Mixed depth | Key commands rich, secondary minimal. | |

**User's choice:** Rich examples
**Notes:** Key commands (connect, vault, evolve, route) should have the most detailed examples.

---

## Cross-References

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, link them | Getting Started links to API.md and PACKS.md. | ✓ |
| Self-contained guide | No external links, everything in one page. | |

**User's choice:** Yes, link them
**Notes:** Use Docusaurus internal links (`/docs/api`, `/docs/packs`), don't duplicate content.

---

## Doc Language

| Option | Description | Selected |
|--------|-------------|----------|
| AI-optimized | Chinese with English terms in parentheses for first mentions. | ✓ |
| Chinese only | Full Chinese throughout. | |

**User's choice:** AI-optimized
**Notes:** "AI 优化混合风格" — Chinese body with English terminology annotated in parentheses for first mention. This helps both human readers and AI agents parsing the site.

---

## Claude's Discretion

- CLI subpage grouping (which commands go together)
- SDK Guide detail (basic evolve coverage)
- Page-level heading hierarchy and anchor structure
- Specific JSON format in examples

## Deferred Ideas

None — discussion stayed within phase scope
