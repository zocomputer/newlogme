"""
CLI entry point for ulogme tracker.

Usage:
    uv run python -m tracker start       # Start daemon in foreground
    uv run python -m tracker run         # Alias for start
    uv run python -m tracker stop        # Stop running daemon
    uv run python -m tracker status      # Check if daemon is running
    uv run python -m tracker install     # Install as launchd service
    uv run python -m tracker uninstall   # Remove launchd service
"""

import sys

from .config import load_config
from .daemon import run_daemon, stop_daemon, check_status
from .launchd import install, uninstall, status as launchd_status


def print_usage() -> None:
    """Print usage information."""
    print("""ulogme - Modern activity tracker for macOS

Usage:
    uv run python -m tracker <command>

Commands:
    start, run    Start the tracker daemon in foreground
    stop          Stop the running daemon
    status        Check if the daemon is running
    install       Install as a launchd service (auto-start on login)
    uninstall     Remove the launchd service

Examples:
    # Start tracking in foreground
    uv run python -m tracker start

    # Install as a service that starts on login
    uv run python -m tracker install

    # Check status
    uv run python -m tracker status

Note: Keystroke counting requires Accessibility permission.
Go to System Settings > Privacy & Security > Accessibility and add your terminal app.
""")


def main() -> None:
    """Main entry point."""
    if len(sys.argv) < 2:
        print_usage()
        sys.exit(1)
    
    command = sys.argv[1].lower()
    
    # Load config once
    config = load_config()
    
    if command in ("start", "run"):
        run_daemon(config)
    elif command == "stop":
        stop_daemon(config)
    elif command == "status":
        check_status(config)
        print()
        launchd_status()
    elif command == "install":
        install(config)
    elif command == "uninstall":
        uninstall()
    elif command in ("help", "-h", "--help"):
        print_usage()
    else:
        print(f"Unknown command: {command}")
        print()
        print_usage()
        sys.exit(1)


if __name__ == "__main__":
    main()

