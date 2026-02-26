---
status: resolved
priority: p2
issue_id: "003"
tags: [code-review, correctness, launchd]
dependencies: []
---

# find_bun_path() Has No `which` Fallback Unlike find_uv_path()

## Problem Statement

`find_uv_path()` has a fallback to `subprocess.run(["which", "uv"])` after checking candidate paths, ensuring it works even when `uv` is installed in a non-standard location. `find_bun_path()` only checks three hardcoded candidate paths and immediately raises `FileNotFoundError` if none exist. Users who installed bun via a package manager other than Homebrew or the official installer (e.g., via nix, cargo, asdf, or a custom prefix) will get an unhelpful error even though `bun` is on their PATH.

## Findings

- `tracker/launchd.py` `find_bun_path()` lines 147–162: checks only `~/.bun/bin/bun`, `/opt/homebrew/bin/bun`, `/usr/local/bin/bun`.
- `tracker/launchd.py` `find_uv_path()` lines 116–144: same three candidates, but also tries `which uv` as a fallback.
- The asymmetry is likely an oversight — the bun function was written after uv's and the `which` fallback was not ported.
- bun can live at: `/usr/bin/bun` (Linux distros), `~/.local/bin/bun` (XDG), `~/.nix-profile/bin/bun` (nix), and others.

## Proposed Solutions

### Option 1: Add `which bun` fallback (mirrors find_uv_path)

```python
    try:
        result = subprocess.run(
            ["which", "bun"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        pass
```

**Pros:** Consistent with find_uv_path; works for any bun installation on PATH.

**Cons:** None significant.

**Effort:** 15 min

**Risk:** Low

---

### Option 2: Unify path-finding logic into a shared helper

Extract a `_find_executable(name, candidates)` function used by both `find_uv_path` and `find_bun_path`. Reduces duplication and ensures consistent behavior.

**Pros:** DRY, easier to maintain.

**Cons:** Slightly more refactoring.

**Effort:** 30 min

**Risk:** Low

## Recommended Action

To be filled during triage.

## Technical Details

**Affected files:**
- `tracker/launchd.py` lines 147–162 (`find_bun_path`)

## Acceptance Criteria

- [ ] `find_bun_path()` falls back to `which bun` when no candidate path exists
- [ ] Behavior is symmetric with `find_uv_path()`
- [ ] Error message on failure is equally descriptive

## Work Log

### 2026-02-26 - Identified during code review

**By:** Claude Code (workflows:review)

**Actions:**
- Compared find_uv_path and find_bun_path side by side in the diff
- Confirmed the which-fallback is present in uv but absent in bun
