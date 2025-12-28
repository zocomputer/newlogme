"""
launchd integration for ulogme.

Provides functions to install/uninstall ulogme as a macOS user agent that
starts automatically on login.
"""

import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from .config import Config, load_config


PLIST_LABEL = "com.ulogme.tracker"
PLIST_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{uv_path}</string>
        <string>run</string>
        <string>--project</string>
        <string>{project_path}</string>
        <string>python</string>
        <string>-m</string>
        <string>tracker</string>
        <string>run</string>
    </array>
    <key>WorkingDirectory</key>
    <string>{project_path}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>LimitLoadToSessionType</key>
    <string>Aqua</string>
    <key>ProcessType</key>
    <string>Interactive</string>
    <key>StandardOutPath</key>
    <string>{log_path}</string>
    <key>StandardErrorPath</key>
    <string>{error_log_path}</string>
</dict>
</plist>
"""


def get_launch_agents_dir() -> Path:
    """Get the LaunchAgents directory for the current user."""
    return Path.home() / "Library" / "LaunchAgents"


def get_plist_path() -> Path:
    """Get the path to the ulogme plist file."""
    return get_launch_agents_dir() / f"{PLIST_LABEL}.plist"


def find_uv_path() -> str:
    """Find the path to the uv executable."""
    # Try common locations
    candidates = [
        Path.home() / ".local" / "bin" / "uv",
        Path.home() / ".cargo" / "bin" / "uv",
        Path("/opt/homebrew/bin/uv"),
        Path("/usr/local/bin/uv"),
    ]
    
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    
    # Try to find it in PATH
    try:
        result = subprocess.run(
            ["which", "uv"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        pass
    
    raise FileNotFoundError(
        "Could not find uv executable. Please ensure uv is installed and in your PATH."
    )


def get_project_path() -> Path:
    """Get the path to the ulogme project directory."""
    # The tracker module is in new/tracker/, so project is new/
    return Path(__file__).parent.parent.resolve()


def generate_plist(config: Config) -> str:
    """Generate the launchd plist content."""
    uv_path = find_uv_path()
    project_path = get_project_path()
    data_dir = config.absolute_db_path.parent
    
    return PLIST_TEMPLATE.format(
        label=PLIST_LABEL,
        uv_path=uv_path,
        project_path=str(project_path),
        log_path=str(data_dir / "tracker.log"),
        error_log_path=str(data_dir / "tracker.error.log"),
    )


def is_installed() -> bool:
    """Check if the launchd service is installed."""
    return get_plist_path().exists()


def is_loaded() -> bool:
    """Check if the launchd service is currently loaded."""
    try:
        result = subprocess.run(
            ["launchctl", "list", PLIST_LABEL],
            capture_output=True,
            text=True,
        )
        return result.returncode == 0
    except Exception:
        return False


def install(config: Config | None = None) -> None:
    """
    Install ulogme as a launchd user agent.
    
    This will:
    1. Generate the plist file with correct paths
    2. Copy it to ~/Library/LaunchAgents/
    3. Load it with launchctl
    """
    if config is None:
        config = load_config()
    
    # Ensure data directory exists
    config.absolute_db_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Generate plist
    try:
        plist_content = generate_plist(config)
    except FileNotFoundError as e:
        print(f"Error: {e}")
        sys.exit(1)
    
    # Ensure LaunchAgents directory exists
    launch_agents_dir = get_launch_agents_dir()
    launch_agents_dir.mkdir(parents=True, exist_ok=True)
    
    plist_path = get_plist_path()
    
    # Unload if already loaded
    if is_loaded():
        print("Unloading existing service...")
        subprocess.run(
            ["launchctl", "unload", str(plist_path)],
            capture_output=True,
        )
    
    # Write plist file
    plist_path.write_text(plist_content)
    print(f"Wrote plist to: {plist_path}")
    
    # Load the service
    result = subprocess.run(
        ["launchctl", "load", str(plist_path)],
        capture_output=True,
        text=True,
    )
    
    if result.returncode != 0:
        print(f"Error loading service: {result.stderr}")
        sys.exit(1)
    
    print(f"ulogme installed and started as launchd service")
    print(f"The tracker will start automatically on login")
    print(f"Logs: {config.absolute_db_path.parent / 'tracker.log'}")


def uninstall() -> None:
    """
    Uninstall the ulogme launchd user agent.
    
    This will:
    1. Unload the service with launchctl
    2. Remove the plist file
    """
    plist_path = get_plist_path()
    
    if not plist_path.exists():
        print("ulogme is not installed as a launchd service")
        return
    
    # Unload the service
    if is_loaded():
        print("Unloading service...")
        result = subprocess.run(
            ["launchctl", "unload", str(plist_path)],
            capture_output=True,
            text=True,
        )
        
        if result.returncode != 0:
            print(f"Warning: Error unloading service: {result.stderr}")
    
    # Remove plist file
    plist_path.unlink()
    print("ulogme launchd service uninstalled")


def status() -> None:
    """Print the status of the launchd service."""
    plist_path = get_plist_path()
    
    if not plist_path.exists():
        print("ulogme is not installed as a launchd service")
        print(f"Run 'uv run python -m tracker install' to install")
        return
    
    print(f"Plist: {plist_path}")
    
    if is_loaded():
        print("Status: loaded and running")
        
        # Get more info
        result = subprocess.run(
            ["launchctl", "list", PLIST_LABEL],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            for line in result.stdout.strip().split("\n"):
                if "PID" in line or PLIST_LABEL in line:
                    print(f"  {line}")
    else:
        print("Status: installed but not loaded")
        print(f"Run 'launchctl load {plist_path}' to start")

