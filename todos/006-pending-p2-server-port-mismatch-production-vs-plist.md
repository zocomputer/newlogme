---
status: resolved
priority: p2
issue_id: "006"
tags: [code-review, correctness, launchd, server]
dependencies: []
---

# Server Plist Runs `bun run server.ts` But Production Needs `bun run prod`

## Problem Statement

The server plist sets `NODE_ENV=production` and is intended to run the server in production mode. However, `ProgramArguments` calls `bun run server.ts` — the development entry point. In production, `server.ts` checks `process.env.NODE_ENV` and calls `configureProduction(app)`, which serves pre-built static assets from `dist/`. This works *only if* `bun run server.ts` directly executes the TypeScript file. The CLAUDE.md docs list `bun run prod` as the production command (`bun run build && bun run prod`). The discrepancy may cause confusion about which code path is exercised.

More concretely: `bun run server.ts` bypasses `package.json` scripts entirely and directly runs the TypeScript file using Bun's built-in transpiler. This is actually equivalent in practice because there is no bundling step for the server — but it skips any `pre`/`post` hooks in package.json and any environment setup in the `prod` script. A future change to `package.json`'s `prod` script (e.g., setting additional env vars) would not be picked up by the launchd service.

Additionally, the user-visible message says "Dashboard will be available at http://localhost:5173" but the actual port comes from `zosite.json`'s `local_port` (currently 5173) and could change. The hardcoded URL in the print statement will be wrong if the port changes.

## Findings

- `tracker/launchd.py` `PLIST_TEMPLATE_SERVER` line 63-65: `bun run server.ts` — not `bun run prod`.
- `site-template/package.json` (not in this PR but relevant context): `prod` script likely does `bun run server.ts` with NODE_ENV set, but the exact script should be verified.
- `tracker/launchd.py` `install_server()` line 375: prints `http://localhost:5173` hardcoded regardless of configured port.
- `tracker/launchd.py` `status_server()` line 491: also prints `http://localhost:5173` hardcoded.
- The port is defined in `site-template/zosite.json` as `local_port: 5173` and read by `server.ts` at runtime.

## Proposed Solutions

### Option 1: Use `bun run prod` to match documented production command

Change `ProgramArguments` to:
```xml
<string>{bun_path}</string>
<string>run</string>
<string>prod</string>
```

And set `WorkingDirectory` to `site_template_path`. This delegates to the package.json script.

**Pros:** Matches documented usage; picks up future changes to prod script.

**Cons:** Requires verifying the `prod` script exists in package.json.

**Effort:** 15 min

**Risk:** Low

---

### Option 2: Keep `bun run server.ts` but document the equivalence

Add a comment in the template and install_server docstring explaining that `bun run server.ts` is equivalent to `bun run prod` because Bun directly executes TS.

**Pros:** No code change.

**Cons:** Future changes to prod script silently diverge.

**Effort:** 5 min

**Risk:** Medium (technical debt)

---

### Option 3: Read port from zosite.json and use it in status messages

Parse `zosite.json` to get the actual port in `install_server()` and `status_server()`.

**Pros:** Accurate user-facing output.

**Cons:** Small additional coupling.

**Effort:** 20 min

**Risk:** Low

## Recommended Action

To be filled during triage.

## Technical Details

**Affected files:**
- `tracker/launchd.py` lines 63–65 (ProgramArguments in PLIST_TEMPLATE_SERVER)
- `tracker/launchd.py` line 375 (install_server print), line 491 (status_server print)
- `site-template/package.json` (verify `prod` script)

## Acceptance Criteria

- [ ] The command used by launchd matches the documented production startup command
- [ ] Port shown in status messages matches the configured port from zosite.json
- [ ] Service starts correctly in production mode after install

## Work Log

### 2026-02-26 - Identified during code review

**By:** Claude Code (workflows:review)

**Actions:**
- Read PLIST_TEMPLATE_SERVER ProgramArguments
- Cross-referenced with CLAUDE.md "bun run prod" command
- Checked hardcoded port in install_server and status_server print statements
