---
phase: 2
slug: e2e-end-to-end-testing
status: final
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-07
updated: 2026-05-08
---

# Phase 2 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Aligned with 4-plan, 2-wave structure.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js native test runner (`node:test`) via `tsx --test` |
| **Config file** | none -- Plan 01 installs `pnpm test:e2e` script |
| **Quick run command** | `pnpm test:e2e` |
| **Full suite command** | `pnpm test:e2e` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:e2e`
- **After every plan wave:** Run `pnpm test:e2e`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command |
|---------|------|------|-------------|-----------|-------------------|
| 2-01-01 | 01 | 1 | E2E-01 | infra | `grep -c "export.*ROOT" tests/e2e/helpers.ts` |
| 2-01-02 | 01 | 1 | E2E-01 | infra | `grep -c "export.*CHAT_AGENT_SCHEMA" tests/e2e/fixtures.ts` |
| 2-01-03 | 01 | 1 | E2E-01 | infra | `node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(p.scripts['test:e2e'])"` |
| 2-02-01 | 02 | 2 | E2E-02 | e2e | `npx tsx --eval "import('./tests/e2e/cli-connect.test.js')"` |
| 2-02-02 | 02 | 2 | E2E-03 | e2e | `npx tsx --eval "import('./tests/e2e/api-negotiate.test.js')"` |
| 2-03-01 | 03 | 2 | E2E-04 | e2e | `npx tsx --eval "import('./tests/e2e/mcp-negotiate.test.js')"` |
| 2-03-02 | 03 | 2 | E2E-05 | e2e | `npx tsx --eval "import('./tests/e2e/pipeline.test.js')"` |
| 2-04-01 | 04 | 2 | E2E-06 | e2e | `npx tsx --eval "import('./tests/e2e/sdk-compile.test.js')"` |

*Status: pending*

---

## Wave Structure

| Wave | Plans | Description |
|------|-------|-------------|
| 1 | 01 | E2E test framework infrastructure (helpers, fixtures, pnpm script) |
| 2 | 02, 03, 04 | All E2E test files (CLI, API, MCP, pipeline, SDK compile) -- parallel safe |

---

## Manual-Only Verifications

*None -- all phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
