---
title: "feat: Deploy ulogme as persistent macOS services"
type: feat
status: active
date: 2026-02-26
deepened: 2026-02-26
---

# feat: Deploy ulogme as Persistent macOS Services

## Enhancement Summary

**Deepened on:** 2026-02-26
**Research agents:** security-sentinel, architecture-reviewer, typescript-reviewer, best-practices (launchd), performance-oracle, simplicity-reviewer, deployment-verification-agent

### Key Improvements from Research

1. **Architecture pivot**: Extend the existing Python CLI rather than create a new TypeScript `launchd.ts` — the simplicity reviewer found the TypeScript approach duplicates all of `tracker/launchd.py` with no technical benefit
2. **Critical security fix**: Add `hostname: "127.0.0.1"` to `server.ts` — currently binds `0.0.0.0` (all interfaces), exposing personal data to any machine on the local network
3. **launchd correctness**: `launchctl load/unload` is deprecated on macOS 13+; use `bootstrap`/`bootout` with `gui/$(id -u)` domain target; fix `ProcessType` from `Interactive` → `Standard`; add `ThrottleInterval`, `ExitTimeOut`, and explicit `PATH`/`HOME` in `EnvironmentVariables`
4. **Build separation**: The build step must happen in `deploy.sh`, NOT inside the install function — conflating build + register causes restart loops if build fails
5. **deploy.sh is missing `bun run build`** — without it the server immediately crashes in production mode (no `dist/` exists), triggering KeepAlive restart loops

### New Considerations Discovered

- `launchctl load` is deprecated and fails silently on macOS 14/15; the modern API is `launchctl bootstrap gui/UID plist_path`
- Plist files default to `644` (world-readable); should be `600` to prevent other processes reading service config
- The `which bun/uv` fallback in binary discovery is a PATH injection vector; should be removed or sanitized
- Log files will grow unbounded with no rotation policy — `newsyslog` should be configured
- The SQL `LIMIT` parameter is interpolated directly without range validation (separate but worth capturing)

---

## Overview

The Python tracker daemon already has full launchd support (`tracker install`), but the Bun/Hono web dashboard server has no equivalent. "Deploy this" means making the **entire stack** (tracker daemon + web server) auto-start at login as macOS LaunchAgents.

## Problem Statement / Motivation

Currently:
- Python tracker: ✅ `uv run python -m tracker install` installs it as a launchd service
- Bun/Hono web server: ❌ Must be started manually (`cd site-template && bun run prod`)

After deploy:
- Both services start at login automatically
- The dashboard is always available at `http://localhost:5173`
- Logs are written to `data/` for debugging
- A single command deploys the whole stack

## Proposed Solution (Revised After Research)

**Original plan:** Create `site-template/launchd.ts` (TypeScript Bun script) + `deploy.sh`.

**Revised plan (simplicity win):** Extend the existing **Python CLI** (`tracker/launchd.py` + `tracker/__main__.py`) with `install-server` / `uninstall-server` / `server-status` commands, plus a thin `deploy.sh` orchestrator. The simplicity reviewer found the TypeScript approach duplicates 100% of the Python launchd module with no technical benefit — each service can own its lifecycle management, but operations belong in the language that already does it.

### Three deliverables (revised):

1. **`tracker/launchd.py`** — Add `find_bun_path()`, `PLIST_LABEL_SERVER`, server plist template, and `install_server` / `uninstall_server` / `status_server` functions
2. **`tracker/__main__.py`** — Add `install-server`, `uninstall-server`, `server-status` CLI commands
3. **`deploy.sh`** (project root) — Thin orchestrator: `bun install` → `bun build` → `tracker install` → `tracker install-server`

> **Note:** If the TypeScript approach is strongly preferred for separation of concerns, a `scripts/install-server.sh` shell script (~30 lines) is the next-simplest alternative to the Python extension. Either approach is correct; the Python extension is recommended for a single unified CLI entry point.

## Technical Considerations

### Revised launchd Plist for Bun Server (With All Fixes Applied)

```xml
<!-- ~/Library/LaunchAgents/com.ulogme.server.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ulogme.server</string>

    <key>ProgramArguments</key>
    <array>
        <string>{bun_path}</string>       <!-- absolute path, resolved at install time -->
        <string>run</string>
        <string>server.ts</string>         <!-- NOT "bun run prod" — build is done at install time -->
    </array>

    <key>WorkingDirectory</key>
    <string>{site_template_path}</string>  <!-- absolute, no tilde -->

    <!-- Explicit PATH and HOME required — launchd only has /usr/bin:/bin:/usr/sbin:/sbin -->
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>{home_path}</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <!-- Restart on crash, allow clean exit to stop the service -->
    <key>KeepAlive</key>
    <dict>
        <key>Crashed</key>
        <true/>
    </dict>

    <!-- Explicit throttle prevents unbounded exponential backoff restart loops -->
    <key>ThrottleInterval</key>
    <integer>10</integer>

    <!-- Standard is correct for a background server — NOT Interactive -->
    <key>ProcessType</key>
    <string>Standard</string>

    <!-- GUI login session only (correct for personal desktop tool) -->
    <key>LimitLoadToSessionType</key>
    <string>Aqua</string>

    <!-- Give process time to finish in-flight requests before SIGKILL -->
    <key>ExitTimeOut</key>
    <integer>10</integer>

    <key>StandardOutPath</key>
    <string>{data_dir}/server.log</string>
    <key>StandardErrorPath</key>
    <string>{data_dir}/server.error.log</string>
</dict>
</plist>
```

### Critical Fix: `hostname: "127.0.0.1"` in `server.ts`

**This fix must ship with or before the launchd deploy.** Currently `server.ts:257` exports:
```typescript
export default { fetch: app.fetch, port, idleTimeout: 255 };
```
Bun defaults to `0.0.0.0` when no `hostname` is specified — binding all network interfaces. On shared Wi-Fi (cafe, office), any machine on the subnet can query `/api/ulogme/day/:date` which returns all window titles and browser URLs. Personal data.

```typescript
// server.ts:257 — add hostname
export default { fetch: app.fetch, port, hostname: "127.0.0.1", idleTimeout: 255 };
```

### Modern launchctl: `bootstrap`/`bootout` (Not `load`/`unload`)

`launchctl load` and `launchctl unload` are deprecated since macOS 10.10 and have confirmed silent failures on Ventura 13.6.7+. The modern idempotent pattern:

```python
import os, subprocess

uid = os.getuid()
domain = f"gui/{uid}"
service = f"gui/{uid}/{PLIST_LABEL_SERVER}"

def load_service(plist_path: Path) -> None:
    # Bootout first (idempotent — ignore error if not loaded)
    subprocess.run(["launchctl", "bootout", service], capture_output=True)
    # Now bootstrap
    result = subprocess.run(
        ["launchctl", "bootstrap", domain, str(plist_path)],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        stderr = result.stderr.strip()
        if "already bootstrapped" not in stderr:
            raise RuntimeError(f"bootstrap failed: {stderr}")
```

> **Note:** The existing `tracker/launchd.py` also uses the deprecated `load`/`unload` API and should be updated alongside the new server functions.

### Finding Bun Path (Secure Version)

Remove the `which bun` fallback — it resolves from the calling process's potentially-tampered PATH. Use explicit candidate list only; fail loudly if not found.

```python
def find_bun_path() -> str:
    """Find the bun executable. Checks known installation paths only."""
    home = Path.home()
    candidates = [
        home / ".bun" / "bin" / "bun",            # default bun install
        Path("/opt/homebrew/bin/bun"),              # Apple Silicon homebrew
        Path("/usr/local/bin/bun"),                 # Intel homebrew
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    raise FileNotFoundError(
        "Could not find bun executable. Please install bun (https://bun.sh) "
        "or add it to one of the expected paths."
    )
```

### Plist File Permissions (Security)

After writing the plist file, explicitly set `600` permissions:

```python
plist_path.write_text(plist_content)
plist_path.chmod(0o600)  # Add this line — prevents other users reading service config
```

Apply the same fix to the existing tracker plist in `tracker/launchd.py:171`.

### Build Separation (Critical Operational Fix)

The `install_server()` function **must not** run `bun run build`. Build and register are separate concerns:

- **install_server()** does: find bun path → create data/ → build `dist/` check → write plist → `launchctl bootstrap` → set 600 permissions
- **deploy.sh** does: `bun install` → `bun run build` → `tracker install` → `tracker install-server`

The server plist points to `bun run server.ts` (not `bun run prod`). `bun run prod` runs the build again on every launchd restart — wrong.

`install_server()` should verify `dist/index.html` exists before loading the plist and abort with a clear message if not.

## System-Wide Impact

- **Interaction graph**: launchd → spawns bun process (absolute path) → bun reads `zosite.json` + `ulogme.toml` → connects to `data/ulogme.db` (WAL mode, concurrent with tracker)
- **Error propagation**: If `dist/` is missing, server logs error and exits with code 1 → launchd sees non-zero exit → `KeepAlive: Crashed: true` does NOT restart (correct behavior, clean exit)
- **State lifecycle**: Two independent launchd plists; each restarts independently; no shared process state
- **API surface parity**: Tracker CLI (`install`, `uninstall`, `status`) gains `install-server`, `uninstall-server`, `server-status` counterparts
- **Integration test scenario**: After `./deploy.sh`, `launchctl list | grep com.ulogme` shows two entries with PIDs; `curl http://localhost:5173/api/ulogme/dates` returns `{"dates":[]}` or populated; `lsof -i :5173 | grep LISTEN` shows bun bound to 127.0.0.1

## Acceptance Criteria

- [ ] `./deploy.sh` runs without error; includes `bun install` + `bun run build` before service install
- [ ] After `./deploy.sh`, both `com.ulogme.tracker` and `com.ulogme.server` appear in `launchctl list` with numeric PIDs
- [ ] `curl http://localhost:5173/api/ulogme/dates` returns HTTP 200 (not connection refused)
- [ ] Server is bound to `127.0.0.1:5173` only (`lsof -i :5173` shows 127.0.0.1, not 0.0.0.0)
- [ ] Dashboard at `http://localhost:5173/` returns HTTP 200 (built React app)
- [ ] Web server logs written to `data/server.log` and `data/server.error.log`
- [ ] After logout/login, both services restart automatically
- [ ] `uv run python -m tracker server-status` shows running/not-running clearly
- [ ] `uv run python -m tracker uninstall-server` cleanly removes the launchd entry
- [ ] Deploy is idempotent: running `./deploy.sh` twice does not error
- [ ] Plist files have `600` permissions (`ls -la ~/Library/LaunchAgents/com.ulogme.*.plist`)
- [ ] `data/server.error.log` is empty after clean deploy

## Success Metrics

- Zero manual steps to get the full ulogme stack running after deploy
- Dashboard available within 5 seconds of login
- Both services survive a system restart
- `data/server.error.log` remains empty during normal operation

## Dependencies & Risks

| Risk | Mitigation |
|---|---|
| Bun not found at expected paths | `find_bun_path()` checks 3 canonical locations; fail with clear error + install URL |
| Port 5173 in use | Pre-deploy check: `lsof -i :5173 -t` — abort if occupied |
| `data/` directory not created | `install_server()` creates `data/` with `mkdir -p` before writing plist |
| `dist/` not built before service install | `install_server()` checks `dist/index.html` exists before loading plist; abort if missing |
| KeepAlive crash loop (if dist/ missing at runtime) | `KeepAlive: {Crashed: true}` + `ThrottleInterval: 10` — clean exits don't restart |
| Accessibility permission for tracker | Existing warning in tracker launchd output; no change |
| launchctl load deprecated on macOS 13+ | Use `bootstrap`/`bootout` API throughout |
| Server exposes personal data on shared networks | `hostname: "127.0.0.1"` in `server.ts` — ship before or with launchd deploy |
| Log files grow unbounded | Configure `newsyslog` entry for rotation (see below) |

## Implementation Plan

### Phase 0: Security Pre-Requisite (ship with or before deploy)

**`site-template/server.ts:257`** — add `hostname: "127.0.0.1"`:
```typescript
export default { fetch: app.fetch, port, hostname: "127.0.0.1", idleTimeout: 255 };
```

### Phase 1: Extend `tracker/launchd.py`

Add to `tracker/launchd.py`:

```python
# New constants
PLIST_LABEL_SERVER = "com.ulogme.server"
PLIST_TEMPLATE_SERVER = """..."""  # see plist template above

# New functions
def find_bun_path() -> str: ...           # check 3 candidate paths, no `which` fallback
def get_site_template_path() -> Path: ... # project_path / "site-template"
def generate_plist_server(config: Config) -> str: ...
def get_plist_path_server() -> Path: ...
def is_installed_server() -> bool: ...
def is_loaded_server() -> bool: ...       # launchctl print gui/UID/com.ulogme.server
def install_server(config: Config) -> None: ...   # check dist/, create data/, write plist 600, bootstrap
def uninstall_server() -> None: ...       # bootout + rm plist
def status_server() -> None: ...

# ALSO: update existing install()/uninstall() to use bootstrap/bootout
# ALSO: add plist_path.chmod(0o600) after write_text() in both install() and install_server()
```

### Phase 2: Extend `tracker/__main__.py`

```python
# Add to main() dispatch:
elif command in ("install-server", "install_server"):
    config = load_config()
    install_server(config)
elif command in ("uninstall-server", "uninstall_server"):
    uninstall_server()
elif command in ("server-status",):
    status_server()

# Update print_usage() to document new commands
```

### Phase 3: `deploy.sh` (project root)

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Installing npm dependencies..."
cd "$SCRIPT_DIR/site-template"
bun install

echo "==> Building frontend..."
bun run build

echo "==> Installing ulogme tracker service..."
cd "$SCRIPT_DIR"
uv run python -m tracker install

echo "==> Installing ulogme web server service..."
uv run python -m tracker install-server

echo ""
echo "ulogme deployed!"
echo "  Dashboard: http://localhost:5173"
echo "  Tracker logs: data/tracker.log"
echo "  Server logs:  data/server.log"
echo ""
echo "Check status: uv run python -m tracker status && uv run python -m tracker server-status"
```

Make executable: `chmod +x deploy.sh`

### Phase 4: Log Rotation via newsyslog

```bash
# Create /etc/newsyslog.d/ulogme.conf (requires sudo)
# OR add entries to /etc/newsyslog.conf
```

File content:
```
# ulogme log rotation
# file                                     mode count size  when  flags
/path/to/data/tracker.log                  644  7     1024  *     GZ
/path/to/data/server.log                   644  7     1024  *     GZ
/path/to/data/tracker.error.log            644  7     1024  *     GZ
/path/to/data/server.error.log             644  7     1024  *     GZ
```

Rotates at 1MB, keeps 7 generations, gzip-compresses.

### Phase 5: Update `CLAUDE.md`

Add to Commands section:
```bash
# Deploy full stack as launchd services (one-time setup)
./deploy.sh

# Service management
uv run python -m tracker install          # Tracker only
uv run python -m tracker install-server   # Web server only
uv run python -m tracker status           # Tracker status
uv run python -m tracker server-status    # Web server status
uv run python -m tracker uninstall        # Remove tracker service
uv run python -m tracker uninstall-server # Remove web server service
```

## Pre-Deploy Verification Checklist

Before loading the plist:

```bash
# 1. Port free
lsof -i :5173 -t  # must be empty

# 2. Data dir writable
touch data/.write_test && rm data/.write_test && echo "WRITABLE"

# 3. Tracker healthy
launchctl list com.ulogme.tracker  # PID must be numeric, not "-"

# 4. Bun found at expected path
~/.bun/bin/bun --version  # must print version

# 5. dist/ built
ls site-template/dist/index.html  # must exist

# 6. Plist valid before loading
plutil -lint ~/Library/LaunchAgents/com.ulogme.server.plist && echo "VALID"

# 7. Server bound to localhost (post-deploy)
lsof -i :5173 | grep LISTEN  # must show 127.0.0.1:5173
```

## Rollback Procedure

```bash
# Server only (tracker unaffected)
uv run python -m tracker uninstall-server
# Confirm
launchctl list | grep ulogme  # only tracker should appear

# Full uninstall
uv run python -m tracker uninstall
uv run python -m tracker uninstall-server
# Database is never modified by install/uninstall — data is safe
```

## Sources & References

### Internal References

- Existing launchd implementation: `tracker/launchd.py` — primary pattern to extend
- Tracker CLI entry point: `tracker/__main__.py:main()` — dispatch pattern
- Server entry point: `site-template/server.ts:252-257` — port + hostname
- Site config: `site-template/zosite.json` — port 5173
- Build scripts: `site-template/package.json` — `prod` and `build` script distinction
- `ulogme-db.ts:26-33` — DB connection handles missing DB gracefully on startup

### launchd Best Practices

- Modern `launchctl bootstrap/bootout` syntax: `launchctl bootstrap gui/$(id -u) plist` replaces deprecated `launchctl load`
- `ProcessType: Standard` (not `Interactive`) for background server
- `KeepAlive: {Crashed: true}` + `ThrottleInterval: 10` prevents restart loops
- `EnvironmentVariables` with explicit `PATH`, `HOME` — launchd has minimal path
- `ExitTimeOut: 10` for graceful SQLite/connection cleanup
- Plist permissions `600` via `Path.chmod(0o600)` after write

### Security Findings

- `hostname: "127.0.0.1"` required in `server.ts` — blocks LAN exposure of personal data
- Remove `which bun/uv` PATH-based fallback from binary discovery functions
- Plist `chmod 0o600` prevents other local processes reading service configuration

### Performance Notes

- Do **not** use `--smol` flag — disables JIT, hurts category regex matching on large days
- `bun run server.ts` (not `bun run prod`) in plist — build runs once at install time
- Cold start: ~150-400ms on Apple Silicon (acceptable for login-time startup)
