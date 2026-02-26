---
status: resolved
priority: p3
issue_id: "008"
tags: [code-review, deploy, shell, quality]
dependencies: []
---

# deploy.sh Has No Idempotency Check or Rollback on Failure

## Problem Statement

`deploy.sh` uses `set -euo pipefail`, which is good — it aborts on the first error. However, it does not check whether services are already running before attempting to reinstall them, and it provides no rollback if the second `install-server` step fails after `install` (tracker service) has already succeeded. The user could be left with a tracker service running but no server service. Additionally, re-running deploy.sh on an already-deployed system will disrupt both services unnecessarily (stop + restart) for every deployment, even if nothing changed.

## Findings

- `deploy.sh` line 15: `uv run python -m tracker install` — always reinstalls, always bounces the tracker service.
- `deploy.sh` line 18: `uv run python -m tracker install-server` — same.
- No `--skip-if-running` flag or check.
- If `bun run build` fails (line 11), no services are touched — this is the correct order.
- If `uv run python -m tracker install` succeeds (line 15) but `install-server` fails (line 18), tracker is running but server is not. The error message only says "ulogme deployed!" for success; failure would just show the Python error and a bash error exit.
- No cleanup or rollback.

## Proposed Solutions

### Option 1: Add a --force flag and skip reinstall if already deployed

```bash
FORCE="${1:-}"

echo "==> Checking current deployment status..."
if uv run python -m tracker status 2>/dev/null | grep -q "loaded and running" && [ -z "$FORCE" ]; then
    echo "Tracker already running. Use ./deploy.sh --force to reinstall."
else
    uv run python -m tracker install
fi
```

**Pros:** Idempotent for the common case; --force for intentional re-deploy.

**Cons:** More complex script; requires parsing status output.

**Effort:** 30 min

**Risk:** Low

---

### Option 2: Document the bounce behavior and leave as-is

Add a comment explaining that deploy.sh always bounces services, and is safe to re-run.

**Pros:** No code change.

**Cons:** Unnecessary service downtime on re-deploys.

**Effort:** 5 min

**Risk:** Low (just a UX issue)

---

### Option 3: Add failure message for partial deployment

Use a trap to detect partial failure:

```bash
trap 'echo "DEPLOY FAILED. Check logs. Services may be in inconsistent state."' ERR
```

**Pros:** Better error messaging without full rollback complexity.

**Cons:** No rollback, just better diagnostics.

**Effort:** 5 min

**Risk:** Low

## Recommended Action

To be filled during triage.

## Technical Details

**Affected files:**
- `deploy.sh` lines 13–18

## Acceptance Criteria

- [ ] Partial deployment failure is surfaced clearly to the user
- [ ] Either: re-running deploy.sh is safe without disruption, or the behavior is documented

## Work Log

### 2026-02-26 - Identified during code review

**By:** Claude Code (workflows:review)
