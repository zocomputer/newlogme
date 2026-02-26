---
status: resolved
priority: p1
issue_id: "001"
tags: [code-review, security, launchd]
dependencies: []
---

# XML Injection in Plist Generation via String .format()

## Problem Statement

`PLIST_TEMPLATE` and `PLIST_TEMPLATE_SERVER` are plain Python strings with `{placeholder}` format fields. All values are inserted with `str.format()` — no XML escaping is performed. Any value that contains XML special characters (`<`, `>`, `&`, `"`, `'`) will produce a malformed or exploitable plist. On macOS, paths that contain characters like `&` or `<` are uncommon but fully legal.

More critically, the `uv_path` and `bun_path` values come from the filesystem (via `which uv` or `candidate.exists()`). An attacker who can write a symlink at, e.g., `~/.local/bin/uv` pointing to a path containing XML metacharacters, or who controls the username/home directory path, can inject arbitrary plist keys. Launchd executes the resulting plist as a persistent user agent.

## Findings

- `tracker/launchd.py` lines 18–51 (`PLIST_TEMPLATE`) and 54–98 (`PLIST_TEMPLATE_SERVER`): both use Python `.format()` directly.
- Injected values: `{uv_path}`, `{bun_path}`, `{project_path}`, `{site_template_path}`, `{home_path}`, `{log_path}`, `{error_log_path}`, `{label}`.
- `generate_plist()` line 182–188 and `generate_plist_server()` line 197–204 call `.format()` with no sanitization.
- The `{label}` constants (`com.ulogme.tracker`, `com.ulogme.server`) are hardcoded and safe, but all path values are runtime-derived.
- macOS paths containing `&` are legal (e.g., a project cloned into `~/Projects/R&D/newlogme`). Such a path would produce invalid XML and silently fail to load, or with a crafted string, inject additional XML.

## Proposed Solutions

### Option 1: Use plistlib for plist generation (Recommended)

Replace the raw string template with Python's stdlib `plistlib` module, which handles all XML escaping automatically.

```python
import plistlib

def generate_plist(config: Config) -> str:
    uv_path = find_uv_path()
    project_path = get_project_path()
    data_dir = config.absolute_db_path.parent
    plist_dict = {
        "Label": PLIST_LABEL,
        "ProgramArguments": [str(uv_path), "run", "--project", str(project_path), "python", "-m", "tracker", "run"],
        "WorkingDirectory": str(project_path),
        "RunAtLoad": True,
        "KeepAlive": True,
        "LimitLoadToSessionType": "Aqua",
        "ProcessType": "Interactive",
        "StandardOutPath": str(data_dir / "tracker.log"),
        "StandardErrorPath": str(data_dir / "tracker.error.log"),
    }
    return plistlib.dumps(plist_dict, fmt=plistlib.FMT_XML).decode()
```

**Pros:**
- Eliminates injection entirely — plistlib escapes all values correctly.
- stdlib, zero new dependencies.
- Produces canonical Apple plist format.

**Cons:**
- Removes the template strings (code restructuring required).

**Effort:** 1-2 hours

**Risk:** Low

---

### Option 2: XML-escape all values before .format()

Add a helper that escapes `&`, `<`, `>`, `"`, `'` before injecting into the template.

```python
import html

def _xml_escape(value: str) -> str:
    return html.escape(value, quote=True)
```

Apply to every value passed to `.format()`.

**Pros:**
- Minimal structural change.

**Cons:**
- Easy to miss a new placeholder in future. Defense-in-depth is weaker than plistlib.
- `html.escape` escapes `"` → `&quot;` which is valid in XML attributes but unusual in plist string values — should be tested.

**Effort:** 30 min

**Risk:** Medium (requires remembering to escape every future value)

---

### Option 3: Validate paths contain no XML special characters, fail fast

Before generating, check that no path contains `<`, `>`, `&`, `"`. Raise an error if so.

**Pros:** Simple, communicates the constraint clearly.

**Cons:** Does not fix the underlying issue — just makes it fail loudly. Legitimate paths with `&` still break installation.

**Effort:** 15 min

**Risk:** High (does not fully mitigate)

## Recommended Action

To be filled during triage. Recommended: Option 1 (plistlib).

## Technical Details

**Affected files:**
- `tracker/launchd.py` lines 18–98 (both templates), 182–204 (both generators)

**Related components:**
- `install()`, `install_server()` call the generators immediately before writing to disk.

**Database changes:** None

## Resources

- **Branch:** feat/deploy-persistent-macos-services
- **plistlib docs:** https://docs.python.org/3/library/plistlib.html

## Acceptance Criteria

- [ ] Plist generation uses plistlib or equivalent XML-safe method
- [ ] A path containing `&` or `<` does not produce malformed XML
- [ ] Existing functionality (install/uninstall/status) continues to work
- [ ] Tests cover at least one path-with-special-chars scenario

## Work Log

### 2026-02-26 - Identified during code review

**By:** Claude Code (workflows:review)

**Actions:**
- Traced PLIST_TEMPLATE and PLIST_TEMPLATE_SERVER through generate_plist / generate_plist_server
- Confirmed no escaping is applied to any runtime path value
- Verified plistlib stdlib availability (Python 3.4+)
