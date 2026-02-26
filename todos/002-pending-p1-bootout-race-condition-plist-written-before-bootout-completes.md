---
status: resolved
priority: p1
issue_id: "002"
tags: [code-review, correctness, launchd, race-condition]
dependencies: []
---

# TOCTOU / Ordering Bug: Plist Written Before bootout Completes

## Problem Statement

In both `install()` and `install_server()`, the code calls `launchctl bootout` (which is asynchronous — it sends a message to launchd and returns before the job is fully stopped), and then immediately overwrites the plist file and calls `launchctl bootstrap`. If launchd is still in the process of tearing down the old service when the new plist is written and `bootstrap` is issued, launchd may use partially-written file contents, ignore the bootstrap, or leave the service in an inconsistent state. This is a known issue with the modern launchctl bootstrap/bootout API on macOS.

## Findings

- `tracker/launchd.py` `install()` lines 277–295: `bootout` → immediate `plist_path.write_text()` → `bootstrap`.
- `tracker/launchd.py` `install_server()` lines 349–366: same pattern.
- `launchctl bootout` returns exit code 0 as soon as launchd accepts the request, not when the process has exited. The job may still be running when `bootstrap` is issued.
- Apple's own `launchctl` manpage notes that `bootout` is asynchronous for services that need graceful termination.
- The `ExitTimeOut` key on the server plist is set to 10 seconds, meaning the old server process could still be holding port 5173 when bootstrap attempts to start the new one, causing `EADDRINUSE`.
- `is_loaded()` checks `launchctl print` which can still return success for a job that has been told to stop but has not yet exited.

## Proposed Solutions

### Option 1: Poll launchctl print after bootout until the job is gone

```python
import time

def _wait_for_bootout(label: str, uid: int, timeout: float = 15.0) -> bool:
    """Wait until the service is no longer listed by launchctl."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = subprocess.run(
            ["launchctl", "print", f"gui/{uid}/{label}"],
            capture_output=True,
        )
        if result.returncode != 0:
            return True
        time.sleep(0.5)
    return False
```

Call after `bootout` and before writing the plist.

**Pros:** Correct, handles the async nature of bootout.

**Cons:** Adds up to ~15s delay in worst case (process stuck). Needs timeout handling.

**Effort:** 1 hour

**Risk:** Low

---

### Option 2: Use bootout + bootstrap as a single atomic operation where possible

On macOS 10.15+, `launchctl bootout gui/$UID label && launchctl bootstrap gui/$UID plist` is the canonical sequence but there is no atomic replace. Option 1 is still required between them.

Alternatively, keep the existing plist path and let launchd's internal restart-on-crash handle updates. Write the new plist, then `launchctl kickstart -k gui/$UID/label` which kills-and-restarts atomically.

```bash
launchctl kickstart -k gui/$UID/com.ulogme.tracker
```

**Pros:** Atomic restart, launchd handles the sequencing.

**Cons:** `kickstart -k` requires the service to be already loaded; does not help for first-time install.

**Effort:** 1-2 hours

**Risk:** Low for the update-existing case; must still handle first-time install separately.

---

### Option 3: Add a short sleep as a pragmatic workaround

Add `time.sleep(2)` after `bootout` to give launchd time to tear down the old process before bootstrapping the new one.

**Pros:** Simple, usually works.

**Cons:** Not guaranteed correct; wrong sleep duration for processes with longer shutdown. Feels hacky.

**Effort:** 5 min

**Risk:** Medium (still racy)

## Recommended Action

To be filled during triage. Option 1 (poll until gone) is most correct; Option 2's `kickstart -k` complements it for the re-install case.

## Technical Details

**Affected files:**
- `tracker/launchd.py`: `install()` ~line 278, `install_server()` ~line 349

**Related components:**
- `ExitTimeOut: 10` in `PLIST_TEMPLATE_SERVER` — this controls how long launchd waits before SIGKILL on bootout.

## Acceptance Criteria

- [ ] After `launchctl bootout`, code waits for the service to fully stop before writing plist and bootstrapping
- [ ] Port-already-in-use error does not occur when reinstalling the server service
- [ ] Timeout (>15s) is surfaced as a warning, not a silent hang

## Work Log

### 2026-02-26 - Identified during code review

**By:** Claude Code (workflows:review)

**Actions:**
- Traced bootout → write → bootstrap sequence in both install functions
- Confirmed ExitTimeOut: 10 means up to 10s gap possible
- Reviewed Apple launchctl manpage for async semantics
