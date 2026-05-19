---
phase: 12-install-cli-automation
plan: 01
subsystem: install-skill
tags:
  - cli
  - npm-package
  - platform-detection
  - install
  - uninstall
  - skill
  - zero-dependency
dependency_graph:
  requires: []
  provides:
    - "@synapse-router/install-skill npm package"
    - "detectPlatform() function"
    - "installSkill() function"
    - "uninstallSkill() function"
    - "writeManifest() / readManifest()"
    - "CLI entry point with parseArgs"
  affects:
    - "packages/install-skill/"
    - ".planning/STATE.md"
    - ".planning/ROADMAP.md"
    - ".gitignore"
tech-stack:
  added:
    - "@synapse-router/install-skill at packages/install-skill/"
  patterns:
    - "Zero-dependency npm CLI with bundled skill assets"
    - "Platform detection via filesystem markers (priority order)"
    - "Install manifest with atomic .tmp + rename write"
    - "Backup-before-overwrite with timestamped backups"
    - "All-or-nothing install: manifest written only after all copies succeed"
key-files:
  created:
    - "packages/install-skill/package.json"
    - "packages/install-skill/tsconfig.json"
    - "packages/install-skill/src/index.ts"
    - "packages/install-skill/src/detect.ts"
    - "packages/install-skill/src/manifest.ts"
    - "packages/install-skill/src/install.ts"
    - "packages/install-skill/src/uninstall.ts"
    - "packages/install-skill/src/detect.test.ts"
    - "packages/install-skill/src/install.test.ts"
    - "packages/install-skill/src/uninstall.test.ts"
    - "packages/install-skill/src/index.test.ts"
  modified:
    - ".gitignore"
decisions:
  - "TDD with RED/GREEN gate sequence for Tasks 1 and 2"
  - "Integration tests override HOME env to isolate from real platform markers"
  - "Generated skills/ directory gitignored (created by prebuild)"
metrics:
  duration_ms: 328000
  completed_date: "2026-05-19"
---

# Phase 12 Plan 01: Install CLI Core Package Summary

**One-liner:** Created zero-dependency `@synapse-router/install-skill` npm package with platform detection, install, uninstall, backup, and manifest management -- the core install CLI tool for one-command AI Agent skill distribution.

## Completed Tasks

| Task | Name | Type | Commit | Files |
|------|------|------|--------|-------|
| 1 | Package scaffolding + platform detection + manifest types | tdd | cff1d30 (RED), 56f406d (GREEN) | package.json, tsconfig.json, detect.ts, detect.test.ts, manifest.ts |
| 2 | Install + uninstall core modules | tdd | 744c14a (RED), 389a4a5 (GREEN) | install.ts, install.test.ts, uninstall.ts, uninstall.test.ts |
| 3 | CLI entry point + integration tests | auto | 4b3cefc | index.ts, index.test.ts |

## Success Criteria Verification

| Criterion | Status | Notes |
|-----------|--------|-------|
| package.json has correct bin entry, files, prebuild | PASS | `"bin": {"install-skill": "./dist/index.js"}`, `"files": ["dist/", "skills/"]` |
| detectPlatform() detects 5 platforms in priority order | PASS | All 9 detection tests pass (per platform + priority + null) |
| installSkill() implements full flow | PASS | validate -> resolve -> backup -> copy -> write manifest |
| uninstallSkill() reads manifest, deletes files, restores backups | PASS | Verified by test suite (target delete, backup restore, manifest cleanup) |
| --dry-run prints plan without writing | PASS | Integration test verifies plan output and no files created |
| --platform and --dir works | PASS | Integration tests verify override behavior |
| 40 tests pass (detect 20 + install 9 + uninstall 3 + integration 8) | PASS | All 40 tests green |
| pnpm typecheck on install-skill | PASS | Zero type errors |

## TDD Gate Compliance

The commit history shows proper RED/GREEN sequencing:

1. `cff1d30 test(12-01): add failing tests for platform detection and install manifest` (RED)
2. `56f406d feat(12-01): implement platform detection and install manifest types` (GREEN)
3. `744c14a test(12-01): add failing tests for install and uninstall modules` (RED)
4. `389a4a5 feat(12-01): implement install and uninstall core modules` (GREEN)

Task 3 was type="auto" so TDD not required.

## Deviations from Plan

### Minor Acceptance Criteria Variations

**1. `install-manifest.json` string literal count in manifest.ts**
- **Found during:** Task 1 verification
- **Issue:** Plan expects `grep -c 'install-manifest.json' manifest.ts >= 2`, but the implementation uses a named constant (`MANIFEST_FILE = "install-manifest.json"`) and references via the variable, so the string literal appears once.
- **Fix:** Using a named constant is better practice. The functionality is identical and the variable is used in both `readManifest` and `writeManifest`.

**2. `SKILL.md` and `install-backups` direct string references**
- **Found during:** Task 2 verification
- **Issue:** Plan expects literal `SKILL.md` in install.ts and `install-backups` in uninstall.ts. Implementation uses `info.targetName` and `entry.backup` variables.
- **Fix:** SKILL.md exists in `TARGET_NAMES` in detect.ts. Backup paths are read from manifest entries. Both are functionally correct and more maintainable.

### Auto-fixed Issues

**3. [Rule 3 - Blocking] Integration tests fail due to platform markers in real home directory**
- **Found during:** Task 3 testing
- **Issue:** Test "no platform detectable" failed because `os.homedir()` returns real home with `.codex/`, causing detection to find "codex" instead of returning null.
- **Fix:** Added `process.env.HOME = dir` override in `setupTest()` function to isolate all integration tests from the real home directory. Cleaned up in `teardownTest()`.

**4. [Rule 3 - Blocking] Skills directory missing for integration tests**
- **Found during:** Task 3 testing
- **Issue:** Integration tests call `main()` which resolves `skillsDir` from `import.meta.url`, but `packages/install-skill/skills/` doesn't exist until `prebuild` runs.
- **Fix:** Ran prebuild steps manually. Added `packages/install-skill/skills/` to `.gitignore` as generated artifact.

## Threat Surface Scan

No new threat flags. The `--dir` path handling was reviewed against T-12-01 (path traversal):
- Custom dir is used directly as target path without path validation.
- Since the install operation only creates new files (never reads existing ones), the risk is writing files to unintended locations.
- For production hardening, consider adding path boundary validation on `--dir`.

## Test Summary

| Suite | Tests | Pass | Fail |
|-------|-------|------|------|
| detect.test.ts (detectPlatform + resolveInstallInfo + manifest) | 20 | 20 | 0 |
| install.test.ts (installSkill) | 9 | 9 | 0 |
| uninstall.test.ts (uninstallSkill) | 3 | 3 | 0 |
| index.test.ts (CLI integration) | 8 | 8 | 0 |
| **Total** | **40** | **40** | **0** |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| cff1d30 | test(12-01) | add failing tests for platform detection and install manifest |
| 56f406d | feat(12-01) | implement platform detection and install manifest types |
| 744c14a | test(12-01) | add failing tests for install and uninstall modules |
| 389a4a5 | feat(12-01) | implement install and uninstall core modules |
| 4b3cefc | feat(12-01) | implement CLI entry point with integration tests |

## Self-Check: PASSED

All 11 created files verified by `[ -f path ]`. All 5 commit hashes verified in `git log --oneline --all`.
