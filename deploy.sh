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
