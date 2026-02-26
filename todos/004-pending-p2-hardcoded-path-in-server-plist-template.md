---
status: resolved
priority: p2
issue_id: "004"
tags: [code-review, correctness, launchd, portability]
dependencies: []
---

# Hardcoded PATH in Server Plist Breaks Non-Homebrew/Intel Mac Setups

## Problem Statement

`PLIST_TEMPLATE_SERVER` embeds a hardcoded `PATH` environment variable:

```
/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
```

This PATH is baked into the plist at generation time and never updated. It covers Apple Silicon Homebrew (`/opt/homebrew/bin`) and Intel Homebrew (`/usr/local/bin`), but misses:
- `~/.bun/bin` — where bun is most commonly installed via the official installer
- `~/.local/bin`, `~/.nix-profile/bin`, `/run/current-system/sw/bin` (nix)
- Any custom user prefix

Since `bun run server.ts` is executed by launchd using this fixed PATH, if `bun` itself needs to resolve sub-executables at runtime (e.g., `node`, `npx` shims, native addons), they will not be found. More immediately: the plist's `ProgramArguments` already specifies the absolute `bun_path`, so the runtime bun binary is correctly launched — but the `PATH` seen *by that bun process* during execution will be incomplete.

Additionally, `bun_path` is resolved at install time and embedded. If the user updates bun after installation, the plist will still point to the old binary path (true for uv as well, but bun is updated frequently).

## Findings

- `tracker/launchd.py` `PLIST_TEMPLATE_SERVER` lines 69–75: PATH is a hardcoded string literal.
- `generate_plist_server()` does not include `~/.bun/bin` in the PATH value even though `find_bun_path()` checks that location first.
- The tracker plist (`PLIST_TEMPLATE`) does not set a PATH env var at all — it relies on launchd's default PATH, which is arguably more correct for user agents.

## Proposed Solutions

### Option 1: Build PATH dynamically including ~/.bun/bin and bun_path's parent

```python
def generate_plist_server(config: Config) -> str:
    bun_path = find_bun_path()
    bun_bin_dir = str(Path(bun_path).parent)
    home = str(Path.home())
    path_entries = [
        bun_bin_dir,
        f"{home}/.bun/bin",
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ]
    # Deduplicate while preserving order
    seen = set()
    unique_path = ":".join(p for p in path_entries if not (p in seen or seen.add(p)))
    ...
```

**Pros:** PATH always includes the directory where bun was found; works for any installation method.

**Cons:** Slightly more logic in generator.

**Effort:** 30 min

**Risk:** Low

---

### Option 2: Omit the PATH override and rely on launchd inheriting from login session

Remove the `EnvironmentVariables`/`PATH` key entirely (or reduce to just `HOME` and `NODE_ENV`). LaunchAgents running in the Aqua session inherit the user's GUI session environment, which already has a fully configured PATH from the user's shell profile.

**Pros:** No hardcoding; correct by construction. Matches the tracker plist behavior.

**Cons:** Launchd GUI session PATH may differ from interactive shell PATH in subtle ways on some setups.

**Effort:** 15 min

**Risk:** Low-Medium (requires testing on target machine)

## Recommended Action

To be filled during triage.

## Technical Details

**Affected files:**
- `tracker/launchd.py` lines 69–75 (`PLIST_TEMPLATE_SERVER` EnvironmentVariables)
- `generate_plist_server()` lines 191–204

## Acceptance Criteria

- [ ] Server plist PATH includes the directory where bun was actually found
- [ ] Installation works on machines using `~/.bun/bin/bun` (official bun installer)
- [ ] Installation works on Apple Silicon and Intel Macs

## Work Log

### 2026-02-26 - Identified during code review

**By:** Claude Code (workflows:review)

**Actions:**
- Compared PATH in plist template against find_bun_path candidate list
- Confirmed ~/.bun/bin is missing from template PATH
