---
status: resolved
priority: p3
issue_id: "009"
tags: [code-review, launchd, security, quality]
dependencies: []
---

# Plist chmod 0o600 May Conflict with launchd Plist Permission Requirements

## Problem Statement

Both `install()` and `install_server()` set the plist file permission to `0o600` (owner read/write only). While launchd does read user agent plists as the owning user, Apple's documentation and common practice recommend `0o644` for LaunchAgent plist files. More importantly, some macOS versions' `launchctl` will refuse to load or warn about plist files that are group/world readable if they are writable, but `0o600` (not readable by group/other) has been observed to cause `launchctl` to silently ignore or fail to load the plist on certain macOS versions, because the launchd daemon itself may not run as the file's owner when performing pre-flight checks.

The restrictive permission is likely motivated by the security concern of preventing other users from reading paths/tokens in the plist. This is a reasonable goal but `0o644` is the standard and is safe for LaunchAgent plists that do not contain secrets.

## Findings

- `tracker/launchd.py` `install()` line 287: `plist_path.chmod(0o600)`.
- `tracker/launchd.py` `install_server()` line 358: `plist_path.chmod(0o600)`.
- The plist files are written to `~/Library/LaunchAgents/` which is already mode `700` on most macOS setups, providing directory-level protection.
- Plist content includes filesystem paths and a hardcoded HOME path — not secrets.
- Apple sample plist files in `/Library/LaunchDaemons/` and `/Library/LaunchAgents/` shipped with macOS use `0o644`.

## Proposed Solutions

### Option 1: Use 0o644 (standard for LaunchAgent plists)

The directory `~/Library/LaunchAgents/` is mode `700`, so other users cannot list or access it regardless. `0o644` is the standard and maximally compatible.

**Pros:** Consistent with macOS conventions; no launchd loading issues.

**Cons:** Slightly less restrictive, though directory permissions mitigate this.

**Effort:** 5 min

**Risk:** Low

---

### Option 2: Keep 0o600 but add a comment explaining the rationale and test matrix

Keep 0o600 and add a comment noting it has been tested on specific macOS versions.

**Pros:** No change; maintains security posture.

**Cons:** Risk of launchd silent failures on some macOS versions.

**Effort:** 5 min

**Risk:** Medium (may cause user reports of "install doesn't work")

## Recommended Action

To be filled during triage.

## Technical Details

**Affected files:**
- `tracker/launchd.py` lines 287, 358

## Acceptance Criteria

- [ ] Plist permission is verified to work correctly with `launchctl bootstrap` on macOS 13 and 14
- [ ] Decision between 0o600 and 0o644 is documented with rationale

## Work Log

### 2026-02-26 - Identified during code review

**By:** Claude Code (workflows:review)

**Actions:**
- Checked Apple sample plists for standard permissions
- Noted ~/Library/LaunchAgents directory protection
- Flagged as potential silent failure source
