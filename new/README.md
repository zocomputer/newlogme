# ulogme - Modern Activity Tracker for macOS

A complete modernization of [karpathy/ulogme](https://github.com/karpathy/ulogme) for modern macOS (Apple Silicon compatible).

## What is ulogme?

ulogme is a personal activity tracker that runs in the background and logs:
- **Active window titles** — What apps and windows you're using
- **Keystroke counts** — How much you're typing (not what you type!)
- **Browser URLs** — Optional URL tracking for browsers

All data stays on your machine in a local DuckDB database. There are no cloud services or network calls.

## Features

- 🍎 Native macOS support (Apple Silicon & Intel)
- 🔒 Privacy-first: only counts keystrokes, never logs key values
- 📊 Beautiful React dashboard with charts and visualizations
- 📅 Logical day boundaries (late night sessions count as previous day)
- 📝 Add notes and daily blog entries
- ⚡ Fast DuckDB storage with powerful analytics queries

## Quick Start

### Prerequisites

- macOS 12+ (Monterey or later)
- [uv](https://github.com/astral-sh/uv) — Python package manager
- [Bun](https://bun.sh/) — JavaScript runtime

### 1. Start the Tracker

```bash
cd new/

# Install Python dependencies
uv sync

# Start the tracker (runs in foreground)
uv run python -m tracker start
```

The first time you run the tracker, macOS will prompt you to grant **Accessibility** permission for keystroke monitoring. Go to:
- System Settings → Privacy & Security → Accessibility
- Add your terminal app (Terminal, iTerm, etc.)

### 2. Install as a Service (Optional)

To have the tracker start automatically when you log in:

```bash
uv run python -m tracker install
```

To uninstall:
```bash
uv run python -m tracker uninstall
```

### 3. Start the Web Dashboard

```bash
cd site-template/

# Install dependencies
bun install

# Start the development server
bun run dev
```

Open http://localhost:5173 (or the port shown in terminal) to view your activity data.

## Commands

### Tracker Daemon

```bash
# Start tracker in foreground
uv run python -m tracker start

# Stop running tracker
uv run python -m tracker stop

# Check status
uv run python -m tracker status

# Install as launchd service (auto-start on login)
uv run python -m tracker install

# Remove launchd service
uv run python -m tracker uninstall
```

### Web Dashboard

```bash
cd site-template/

# Development mode with hot reload
bun run dev

# Production build
bun run build
bun run prod
```

## Configuration

Edit `ulogme.toml` to customize:

```toml
[tracking]
window_titles = true    # Track window titles
browser_tabs = true     # Track browser tab titles
browser_urls = true     # Track full URLs
keystrokes = true       # Count keystrokes
window_poll_interval = 2  # Seconds between window checks

[day_boundary]
hour = 7  # Day starts at 7am (late night = previous day)

[category_mappings.rules]
# Regex patterns to categorize apps
[[category_mappings.rules]]
pattern = "Google Chrome|Safari|Arc"
category = "Browser"

[[category_mappings.rules]]
pattern = "VS Code|Cursor"
category = "Coding"
```

## Data Storage

All data is stored in `data/ulogme.duckdb`, a local DuckDB database file.

### Tables

- `window_events` — Active window changes with timestamps
- `key_events` — Keystroke counts per time window
- `notes` — User annotations
- `daily_blog` — Daily journal entries
- `settings` — User preferences

## Privacy & Security

1. **Keystroke counting only** — We never log actual key characters
2. **Local storage only** — All data stays on your machine
3. **No network calls** — The tracker daemon is fully offline
4. **Accessibility permission** — Required for global key monitoring

## Architecture

```
new/
├── tracker/              # Python daemon
│   ├── daemon.py         # Main entry point
│   ├── window.py         # Window tracking (PyObjC)
│   ├── keyboard.py       # Keystroke counting
│   ├── storage.py        # DuckDB operations
│   └── launchd.py        # macOS service integration
├── data/                 # Database and logs
│   └── ulogme.duckdb
├── site-template/        # React dashboard
│   ├── server.ts         # Hono API server
│   ├── backend-lib/      # DuckDB queries
│   └── src/              # React frontend
└── ulogme.toml           # Configuration
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Package Manager | uv (Python), Bun (TypeScript) |
| Database | DuckDB |
| Backend | Hono on Bun |
| Frontend | React + Vite + Tailwind + shadcn/ui |
| Charts | Recharts |
| Tracker | Python + PyObjC |

## Credits

Original project: [karpathy/ulogme](https://github.com/karpathy/ulogme) by Andrej Karpathy

This is a complete rewrite with modern tooling while preserving the core concepts.

