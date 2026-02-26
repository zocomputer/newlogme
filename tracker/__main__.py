"""
CLI entry point for ulogme tracker.

Usage:
    uv run python -m tracker start            # Start daemon in foreground
    uv run python -m tracker run              # Alias for start
    uv run python -m tracker stop             # Stop running daemon
    uv run python -m tracker status           # Check if daemon is running
    uv run python -m tracker install          # Install as launchd service
    uv run python -m tracker uninstall        # Remove launchd service
    uv run python -m tracker install-server   # Install web server as launchd service
    uv run python -m tracker uninstall-server # Remove web server launchd service
    uv run python -m tracker server-status    # Check web server service status
"""

import sys

from .config import load_config
from .daemon import run_daemon, stop_daemon, check_status
from .launchd import (
    install,
    uninstall,
    status as launchd_status,
    install_server,
    uninstall_server,
    status_server,
)


def print_usage() -> None:
    """Print usage information."""
    print("""ulogme - Modern activity tracker for macOS

Usage:
    uv run python -m tracker <command> [options]

Commands:
    start, run    Start the tracker daemon in foreground
    stop          Stop the running daemon
    status        Check if the daemon is running
    install       Install as a launchd service (auto-start on login)
    uninstall     Remove the launchd service
    install-server  Install the web server as a launchd service (auto-start on login)
    uninstall-server Remove the web server launchd service
    server-status   Check web server launchd service status

Options:
    --verbose, -v    Print debug output (poll ticks, keystroke flushes)

Examples:
    # Start tracking in foreground
    uv run python -m tracker start

    # Start with debug output
    uv run python -m tracker start --verbose

    # Install as a service that starts on login
    uv run python -m tracker install

    # Check status
    uv run python -m tracker status

    # Install web server as a service
    uv run python -m tracker install-server

    # Check web server status
    uv run python -m tracker server-status

Note: Keystroke counting requires Accessibility permission.
Go to System Settings > Privacy & Security > Accessibility and add your terminal app.
""")


def main() -> None:
    """Main entry point."""
    if len(sys.argv) < 2:
        print_usage()
        sys.exit(1)
    
    command = sys.argv[1].lower()
    verbose = "--verbose" in sys.argv or "-v" in sys.argv
    
    # Load config once
    config = load_config()
    
    if command in ("start", "run"):
        run_daemon(config, verbose=verbose)
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
    elif command in ("install-server", "install_server"):
        install_server(config)
    elif command in ("uninstall-server", "uninstall_server"):
        uninstall_server()
    elif command in ("server-status", "server_status"):
        status_server()
    elif command in ("help", "-h", "--help"):
        print_usage()
    else:
        print(f"Unknown command: {command}")
        print()
        print_usage()
        sys.exit(1)


if __name__ == "__main__":
    main()

