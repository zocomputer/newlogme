---
status: resolved
priority: p2
issue_id: "005"
tags: [code-review, correctness, deploy, shell]
dependencies: []
---

# deploy.sh Missing `uv sync` Step Before Tracker Install

## Problem Statement

`deploy.sh` runs `bun install` to install frontend dependencies, then calls `uv run python -m tracker install`. However, it never calls `uv sync` to install Python dependencies first. `uv run` will automatically sync if the lockfile is present, but only if the virtual environment is out of date or missing — on a fresh checkout the environment may not exist at all. The CLAUDE.md docs explicitly list `uv sync` as the first setup step. Omitting it from deploy.sh means a first-time deployment on a clean machine may fail or install an inconsistent environment.

Additionally, deploy.sh has no preflight check to verify that `uv` and `bun` are installed before attempting to use them, leading to confusing errors.

## Findings

- `deploy.sh` lines 7–18: `bun install` → `bun run build` → `uv run python -m tracker install` → `uv run python -m tracker install-server`.
- No `uv sync` call before any `uv run` invocation.
- CLAUDE.md (project instructions) section "Tracker Daemon (Python)" lists `uv sync` as the mandatory first command.
- `uv run` with `--project` will trigger a sync, but `uv run python -m tracker install` here runs from `$SCRIPT_DIR` without `--project`, so uv must find the project root via config discovery. This works but is implicit.
- No check for existence of `uv` binary (line 15: `uv run ...` will give `command not found` with no helpful message).
- No check for existence of `bun` binary (line 8: same problem).

## Proposed Solutions

### Option 1: Add uv sync + preflight binary checks

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Preflight checks
command -v uv >/dev/null 2>&1 || { echo "Error: uv not found. Install from https://docs.astral.sh/uv/"; exit 1; }
command -v bun >/dev/null 2>&1 || { echo "Error: bun not found. Install from https://bun.sh"; exit 1; }

echo "==> Syncing Python dependencies..."
cd "$SCRIPT_DIR"
uv sync

echo "==> Installing npm dependencies..."
cd "$SCRIPT_DIR/site-template"
bun install
...
```

**Pros:** Correct, self-documenting, gives useful error messages on missing tools.

**Cons:** None significant.

**Effort:** 15 min

**Risk:** Low

---

### Option 2: Document uv sync as a prerequisite in the script header comment

Add a comment at the top of deploy.sh noting that `uv` and `bun` must be installed and `uv sync` run first. Rely on `uv run` auto-sync behavior.

**Pros:** Minimal change.

**Cons:** Silent failures remain possible on fresh machines. Inconsistent with documented setup flow.

**Effort:** 5 min

**Risk:** Medium

## Recommended Action

To be filled during triage.

## Technical Details

**Affected files:**
- `deploy.sh` lines 1–26

## Acceptance Criteria

- [ ] `deploy.sh` checks for `uv` and `bun` before proceeding
- [ ] Python dependencies are synced before `uv run python -m tracker install`
- [ ] Fresh checkout deployment succeeds end-to-end on a machine with uv and bun installed

## Work Log

### 2026-02-26 - Identified during code review

**By:** Claude Code (workflows:review)

**Actions:**
- Read deploy.sh line by line
- Cross-referenced with CLAUDE.md setup commands
- Confirmed no uv sync and no preflight checks
