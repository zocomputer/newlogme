#!/usr/bin/env bash
set -euo pipefail

# Report partial deployment failure clearly
trap 'echo "" >&2; echo "ERROR: deploy.sh failed — services may be in an inconsistent state. Check logs above." >&2' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Preflight checks
if ! command -v bun &>/dev/null; then
    echo "Error: bun is not installed or not in PATH. Install from https://bun.sh" >&2
    exit 1
fi

if ! command -v uv &>/dev/null; then
    echo "Error: uv is not installed or not in PATH. Install from https://docs.astral.sh/uv" >&2
    exit 1
fi

echo "==> Syncing Python dependencies..."
cd "$SCRIPT_DIR"
uv sync

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
