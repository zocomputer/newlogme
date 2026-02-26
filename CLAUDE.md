# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ulogme is a personal activity tracker for macOS that logs active window titles, keystroke counts (not actual keys), and browser URLs. All data stays local in a SQLite database. It's a modernization of karpathy/ulogme.

**Three main layers:**
1. **Python Tracker Daemon** (`tracker/`) — Collects data via PyObjC
2. **TypeScript Backend API** (`site-template/server.ts`) — Serves data via Hono on Bun
3. **React Dashboard** (`site-template/src/`) — Visualizes via Recharts

**Data flow:** macOS Events → Python Daemon → SQLite (`data/ulogme.db`) → Hono API → React Dashboard

## Commands

### Tracker Daemon (Python)
```bash
uv sync                                    # Install dependencies
uv run python -m tracker start             # Run in foreground
uv run python -m tracker start --verbose   # With debug output
uv run python -m tracker stop              # Stop running tracker
uv run python -m tracker status            # Check if running
uv run python -m tracker install           # Install as launchd service
uv run python -m tracker uninstall         # Remove launchd service
uv run python -m tracker install-server    # Install web server as launchd service
uv run python -m tracker uninstall-server  # Remove web server launchd service
uv run python -m tracker server-status     # Check web server service status
```

### Web Dashboard (TypeScript/React)
```bash
cd site-template/
bun install                                # Install dependencies
bun run dev                                # Dev server at http://localhost:5173
bun run build && bun run prod              # Production build
```

### Deploy as macOS Services (Auto-start on Login)
```bash
./deploy.sh                                    # Deploy full stack (one-time setup)

# Individual service management
uv run python -m tracker install               # Install tracker service
uv run python -m tracker install-server        # Install web server service
uv run python -m tracker uninstall             # Remove tracker service
uv run python -m tracker uninstall-server      # Remove web server service
uv run python -m tracker status                # Tracker + launchd status
uv run python -m tracker server-status         # Web server launchd status
```

### Query Database Directly
```bash
uv run python -c "
import sqlite3
conn = sqlite3.connect('data/ulogme.db')
print(conn.execute('SELECT COUNT(*) FROM window_events').fetchone())
conn.close()
"
```

## Architecture

### Key Design Decisions
- **Logical day at 7am** — Late-night sessions count as previous day (`day_boundary.hour` in `ulogme.toml`)
- **9-second keystroke windows** — Aggregates key counts, matching original ulogme behavior
- **Category rules at display time** — Changing `ulogme.toml` immediately affects all historical data
- **Pure PyObjC** — No wrapper libraries for macOS APIs

### Python Tracker (`tracker/`)
| File | Purpose |
|------|---------|
| `daemon.py` | Main event loop, coordinates window polling + keyboard listener |
| `window.py` | Gets active window via NSWorkspace, extracts browser URLs |
| `keyboard.py` | Global key event tap via Quartz CGEventTap |
| `storage.py` | SQLite storage layer (schema, inserts, queries) |
| `config.py` | Loads `ulogme.toml`, category matching |
| `launchd.py` | Generates plist, manages launchctl |

### TypeScript Backend (`site-template/`)
| File | Purpose |
|------|---------|
| `server.ts` | Hono routes, serves API + Vite dev middleware |
| `backend-lib/ulogme-db.ts` | SQLite queries via `bun:sqlite`, data transformations |
| `backend-lib/config.ts` | TOML parsing, category matching (mirrors Python) |

### React Frontend (`site-template/src/`)
| Path | Purpose |
|------|---------|
| `pages/DayView.tsx` | Main day visualization (timeline, charts, notes) |
| `pages/Overview.tsx` | Multi-day aggregated view |
| `pages/Settings.tsx` | Configuration UI |
| `components/ulogme/` | Domain-specific chart components |

### Database Schema (SQLite)
```sql
window_events (timestamp TEXT, app_name TEXT, window_title TEXT, browser_url TEXT, logical_date TEXT)
key_events (timestamp TEXT PK, key_count INTEGER, logical_date TEXT)
notes (timestamp TEXT PK, content TEXT, logical_date TEXT)
daily_blog (logical_date TEXT PK, content TEXT)
settings (key TEXT PK, value TEXT)
```

The `logical_date` field enables grouping by "work day" rather than calendar day.

## Configuration

Edit `ulogme.toml` at the project root. Key sections:
- `[tracking]` — Enable/disable window titles, URLs, keystrokes
- `[day_boundary]` — When the logical day starts (default: 7am)
- `[[category_mappings.rules]]` — Regex patterns for categorization (order matters, first match wins)
- `[hacking]` — Categories counted as "focused work" for streak tracking

## API Endpoints

All under `/api/ulogme/`:
- `GET /dates` — List dates with data
- `GET /day/:date` — All data for a date (YYYY-MM-DD)
- `GET /day/:date/categories` — Category breakdown with durations
- `GET /day/:date/apps` — App usage breakdown
- `GET /overview` — Aggregated multi-day stats
- `GET /config` — Category rules and colors
- `POST /note` — Add note `{logical_date, text}`
- `PUT /blog/:date` — Save blog entry `{content}`

## Debugging

- **Tracker not logging:** Run with `--verbose` flag, check `data/tracker.log`
- **Keystrokes not counting:** Grant Accessibility permission to terminal (foreground) or Python binary (launchd)
- **Database lock errors:** SQLite uses WAL mode for concurrent reads; if locked, check for long-running writers
- **Service issues:** `launchctl list | grep ulogme` (exit code 0 = running)
