---
phase: 12-install-cli-automation
plan: 02
subsystem: ci-cd
tags: ["github-actions", "npm-publish", "ci-cd", "workflow"]
dependency_graph:
  requires: ["12-01"]
  provides: []
  affects: ["github-releases", "npm-registry"]
tech-stack:
  added:
    - "GitHub Actions: workflow definition for tag-triggered npm publish"
  patterns:
    - "Tag-triggered publish with build+test gate"
    - "Dual package publish via pnpm --filter"
    - "Version derivation from git tag"
    - "npm provenance with OIDC id-token"
    - "GitHub Release auto-generation"
key-files:
  created:
    - .github/workflows/publish.yml
decisions:
  - "Single publish job (no matrix) — both packages are co-versioned from same git tag"
  - "actions/checkout@v6, actions/setup-node@v4, pnpm/action-setup@v4 for standard CI"
  - "id-token: write permission for npm provenance OIDC token flow"
  - "pnpm install --frozen-lockfile for reproducible CI builds"
  - "--no-git-checks on publish to skip git status checks that fail in CI"
metrics:
  duration: "~5 minutes"
  completed_date: "2026-05-19"
---

# Phase 12 Plan 02: GitHub Actions CI/CD Publish Workflow — Summary

创建 GitHub Actions CI/CD 发布工作流，在 git tag `v*` push 时自动构建、测试并发布 `@synapse-router/skill` 和 `@synapse-router/install-skill` 两个包到 npm registry，同时自动生成 GitHub Release。

## Tasks Completed

| # | Name | Status | Commit | Files |
|---|------|--------|--------|-------|
| 1 | GitHub Actions tag-triggered publish workflow | Done | 8df0d01 | `.github/workflows/publish.yml` |

### Task 1: GitHub Actions tag-triggered publish workflow

创建 `.github/workflows/publish.yml`，包含以下特性：

- **Trigger**: `push: tags: v*` — tags like `v0.1.0`, `v1.0.0` trigger the workflow
- **Quality gate**: `pnpm build` + `pnpm test` run before any publish step
- **Version derivation**: `${GITHUB_REF_NAME#v}` extracts version from git tag
- **Dual publish**: Both `@synapse-router/skill` and `@synapse-router/install-skill` published via `pnpm --filter`
- **Version sync**: `pnpm version --no-git-tag-version` bumps each package's version to match the tag
- **Provenance**: `--provenance` flag with `id-token: write` permission for Sigstore build attestation
- **Public access**: `--access public` required for scoped `@synapse-router/*` packages
- **GitHub Release**: `gh release create --generate-notes` auto-generates release notes
- **Permissions**: Least privilege — `contents: write` (Release) + `id-token: write` (provenance only)

## Acceptance Criteria Verification

| Criteria | Status |
|----------|--------|
| `.github/workflows/publish.yml` exists | PASS |
| `NPM_TOKEN` references (2 publish steps) | PASS (2 occurrences) |
| `--provenance` flags (2 packages) | PASS (2 occurrences) |
| `--access public` flags (2 packages) | PASS (2 occurrences) |
| `id-token: write` permission | PASS |
| `contents: write` permission | PASS |
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm build` gate | PASS |
| `pnpm test` gate | PASS |
| Version derivation (`GITHUB_REF_NAME#v`) | PASS |
| `gh release create` with `--generate-notes` | PASS |
| `@synapse-router/skill` reference | PASS |
| `@synapse-router/install-skill` reference | PASS |
| pnpm --filter targets resolve for both packages | PASS |
| `@synapse-router/skill` builds | PASS |
| `@synapse-router/install-skill` builds | PASS |

## User Setup Required

The following manual steps are required before the workflow can run:

1. **Create npm Automation token**
   - Visit: https://www.npmjs.com/settings/qise-tech/tokens
   - Generate a token with type "Automation" (no 2FA required for CI)
   - Copy the token value immediately (shown only once)

2. **Add NPM_TOKEN as GitHub Secret**
   - Go to: GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret
   - Name: `NPM_TOKEN`
   - Value: the Automation token from step 1
   - Save

3. **Verify package scopes exist on npm**
   - Check: https://www.npmjs.com/package/@synapse-router/skill
   - Check: https://www.npmjs.com/package/@synapse-router/install-skill
   - Both packages must exist on npm before the publish workflow will succeed

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written.

### Pre-existing Issues (not related to this plan)

**1. Build failure in `packages/sdk-generator`**
- Error: TypeScript `TS2345` — `ProviderPricing` type not assignable to `ProviderCardPricing` (lines 17, 115 of `src/billing.ts`)
- Impact: `pnpm build` (full monorepo) fails. The two target packages build fine independently.
- CI/CD impact: Publish workflow will fail at the `pnpm build` gate until fixed.
- Filed in: `12-deferred-items.md`

**2. Test failure in `apps/api`: `POST with invalid JSON returns 400`**
- Error: The invalid JSON test fails (1 assertion)
- Impact: `pnpm test` (full suite) fails. Not related to this plan's changes.

## Known Stubs

None — this plan only creates a workflow YAML file with no stubs.

## Threat Flags

None. The workflow follows the threat model mitigations:
- T-12-07 (Spoofing): `--provenance` and `id-token: write` enabled
- T-12-08 (Tampering): `--frozen-lockfile` prevents dependency drift
- T-12-10 (Information Disclosure): NPM_TOKEN used as secret, auto-redacted by GitHub
- T-12-11 (Elevation of Privilege): Explicit scoped permissions (`contents: write`, `id-token: write` only)

## Self-Check: PASSED

- [x] `.github/workflows/publish.yml` exists (verified)
- [x] All 15+ grep acceptance criteria pass
- [x] pnpm --filter targets resolve correctly
- [x] Target packages build successfully
- [x] Commit `8df0d01` exists in git log
