---
status: resolved
priority: p3
issue_id: "007"
tags: [code-review, launchd, quality]
dependencies: []
---

# Tracker Plist Uses Simple KeepAlive Boolean vs Server Plist's Dict Form

## Problem Statement

The tracker plist uses `<key>KeepAlive</key><true/>` (unconditional restart), while the server plist uses the more nuanced `<key>KeepAlive</key><dict><key>Crashed</key><true/></dict>` form (restart only on crash). The tracker should arguably also use the dict form with `SuccessfulExit: false` or `Crashed: true`, because restarting unconditionally means launchd will restart the tracker even if it intentionally exits (e.g., when the user runs `uv run python -m tracker stop`). With unconditional KeepAlive, `tracker stop` sends SIGTERM and the process exits, but launchd immediately relaunches it — the stop command becomes ineffective for launchd-managed instances.

## Findings

- `tracker/launchd.py` `PLIST_TEMPLATE` line 39: `<key>KeepAlive</key><true/>`.
- `tracker/launchd.py` `PLIST_TEMPLATE_SERVER` lines 79–83: `<key>KeepAlive</key><dict><key>Crashed</key><true/></dict>`.
- `tracker/daemon.py` (not in this PR): `stop_daemon()` writes a stop-file and sends SIGTERM. This would be ineffective for launchd-managed tracker instances with unconditional KeepAlive.
- The user-facing `tracker stop` and `tracker status` commands operate on the daemon PID file. They are not launchd-aware, leading to confusion when the tracker is running under launchd.

## Proposed Solutions

### Option 1: Change tracker KeepAlive to dict form with SuccessfulExit: false

```xml
<key>KeepAlive</key>
<dict>
    <key>SuccessfulExit</key>
    <false/>
</dict>
```

This restarts on crash or non-zero exit, but not on clean exit (exit code 0). Users can then `launchctl bootout gui/$UID/com.ulogme.tracker` to properly stop the service.

**Pros:** Correct semantics; stop-on-demand via bootout works cleanly.

**Cons:** Minor behavioral change.

**Effort:** 10 min

**Risk:** Low

---

### Option 2: Document that `tracker stop` does not work for launchd-managed instances

Add a note in `stop_daemon()` and `tracker stop` help text that when running under launchd, users should use `launchctl bootout` or `tracker uninstall`.

**Pros:** No plist change required.

**Cons:** UX confusion remains.

**Effort:** 15 min

**Risk:** Low

## Recommended Action

To be filled during triage.

## Technical Details

**Affected files:**
- `tracker/launchd.py` line 39 (PLIST_TEMPLATE KeepAlive)
- Potentially `tracker/__main__.py` stop command help text

## Acceptance Criteria

- [ ] KeepAlive semantics for the tracker plist are intentional and documented
- [ ] `tracker stop` behavior under launchd management is documented or fixed

## Work Log

### 2026-02-26 - Identified during code review

**By:** Claude Code (workflows:review)
