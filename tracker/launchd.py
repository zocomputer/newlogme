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

PLIST_LABEL_SERVER = "com.ulogme.server"
PLIST_TEMPLATE_SERVER = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{bun_path}</string>
        <string>run</string>
        <string>server.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>{site_template_path}</string>
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
    <key>KeepAlive</key>
    <dict>
        <key>Crashed</key>
        <true/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>ProcessType</key>
    <string>Standard</string>
    <key>LimitLoadToSessionType</key>
    <string>Aqua</string>
    <key>ExitTimeOut</key>
    <integer>10</integer>
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


def get_plist_path_server() -> Path:
    """Get the path to the ulogme server plist file."""
    return get_launch_agents_dir() / f"{PLIST_LABEL_SERVER}.plist"


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


def find_bun_path() -> str:
    """Find the path to the bun executable."""
    candidates = [
        Path.home() / ".bun" / "bin" / "bun",
        Path("/opt/homebrew/bin/bun"),
        Path("/usr/local/bin/bun"),
    ]

    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    raise FileNotFoundError(
        "Could not find bun executable. Please install bun (https://bun.sh) "
        "or ensure it is in one of: ~/.bun/bin/bun, /opt/homebrew/bin/bun, /usr/local/bin/bun"
    )


def get_project_path() -> Path:
    """Get the path to the ulogme project directory."""
    # The tracker module is in new/tracker/, so project is new/
    return Path(__file__).parent.parent.resolve()


def get_site_template_path() -> Path:
    """Get the path to the site-template directory."""
    return get_project_path() / "site-template"


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


def generate_plist_server(config: Config) -> str:
    """Generate the launchd plist content for the web server."""
    bun_path = find_bun_path()
    site_template_path = get_site_template_path()
    data_dir = config.absolute_db_path.parent

    return PLIST_TEMPLATE_SERVER.format(
        label=PLIST_LABEL_SERVER,
        bun_path=bun_path,
        site_template_path=str(site_template_path),
        home_path=str(Path.home()),
        log_path=str(data_dir / "server.log"),
        error_log_path=str(data_dir / "server.error.log"),
    )


def is_installed() -> bool:
    """Check if the launchd service is installed."""
    return get_plist_path().exists()


def is_loaded() -> bool:
    """Check if the launchd service is currently loaded."""
    try:
        uid = os.getuid()
        result = subprocess.run(
            ["launchctl", "print", f"gui/{uid}/{PLIST_LABEL}"],
            capture_output=True,
            text=True,
        )
        return result.returncode == 0
    except Exception:
        return False


def is_installed_server() -> bool:
    """Check if the server launchd service is installed."""
    return get_plist_path_server().exists()


def is_loaded_server() -> bool:
    """Check if the server launchd service is currently loaded."""
    try:
        uid = os.getuid()
        result = subprocess.run(
            ["launchctl", "print", f"gui/{uid}/{PLIST_LABEL_SERVER}"],
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
    
    uid = os.getuid()
    service_target = f"gui/{uid}/{PLIST_LABEL}"
    domain_target = f"gui/{uid}"

    # Bootout if already loaded
    if is_loaded():
        print("Unloading existing service...")
        subprocess.run(
            ["launchctl", "bootout", service_target],
            capture_output=True,
        )

    # Write plist file with restricted permissions
    plist_path.write_text(plist_content)
    plist_path.chmod(0o600)
    print(f"Wrote plist to: {plist_path}")

    # Load the service
    result = subprocess.run(
        ["launchctl", "bootstrap", domain_target, str(plist_path)],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        stderr = result.stderr.strip()
        if "already bootstrapped" not in stderr:
            print(f"Error loading service: {stderr}")
            sys.exit(1)
    
    print(f"ulogme installed and started as launchd service")
    print(f"The tracker will start automatically on login")
    print(f"Logs: {config.absolute_db_path.parent / 'tracker.log'}")


def install_server(config: Config | None = None) -> None:
    """
    Install the ulogme web server as a launchd user agent.

    This will:
    1. Verify the frontend is built (dist/index.html exists)
    2. Generate the plist file with correct paths
    3. Copy it to ~/Library/LaunchAgents/
    4. Load it with launchctl bootstrap
    """
    if config is None:
        config = load_config()

    # Ensure data directory exists
    config.absolute_db_path.parent.mkdir(parents=True, exist_ok=True)

    # Verify frontend is built
    site_template_path = get_site_template_path()
    dist_index = site_template_path / "dist" / "index.html"
    if not dist_index.exists():
        print(f"Error: Frontend not built. Run 'bun run build' in {site_template_path} first.")
        print(f"  Expected: {dist_index}")
        sys.exit(1)

    # Generate plist
    try:
        plist_content = generate_plist_server(config)
    except FileNotFoundError as e:
        print(f"Error: {e}")
        sys.exit(1)

    # Ensure LaunchAgents directory exists
    launch_agents_dir = get_launch_agents_dir()
    launch_agents_dir.mkdir(parents=True, exist_ok=True)

    plist_path = get_plist_path_server()
    uid = os.getuid()
    service_target = f"gui/{uid}/{PLIST_LABEL_SERVER}"
    domain_target = f"gui/{uid}"

    # Bootout first (idempotent — ignore error if not loaded)
    if is_loaded_server():
        print("Unloading existing server service...")
        subprocess.run(
            ["launchctl", "bootout", service_target],
            capture_output=True,
        )

    # Write plist file with restricted permissions
    plist_path.write_text(plist_content)
    plist_path.chmod(0o600)
    print(f"Wrote plist to: {plist_path}")

    # Load the service
    result = subprocess.run(
        ["launchctl", "bootstrap", domain_target, str(plist_path)],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        stderr = result.stderr.strip()
        if "already bootstrapped" not in stderr:
            print(f"Error loading server service: {stderr}")
            sys.exit(1)

    print("ulogme web server installed and started as launchd service")
    print("The dashboard will be available at http://localhost:5173 after login")
    print(f"Logs: {config.absolute_db_path.parent / 'server.log'}")


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
    
    uid = os.getuid()
    service_target = f"gui/{uid}/{PLIST_LABEL}"

    # Bootout the service
    if is_loaded():
        print("Unloading service...")
        result = subprocess.run(
            ["launchctl", "bootout", service_target],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            print(f"Warning: Error unloading service: {result.stderr}")

    # Remove plist file
    plist_path.unlink()
    print("ulogme launchd service uninstalled")


def uninstall_server() -> None:
    """
    Uninstall the ulogme web server launchd user agent.
    """
    plist_path = get_plist_path_server()

    if not plist_path.exists():
        print("ulogme web server is not installed as a launchd service")
        return

    uid = os.getuid()
    service_target = f"gui/{uid}/{PLIST_LABEL_SERVER}"

    # Bootout the service
    if is_loaded_server():
        print("Unloading server service...")
        result = subprocess.run(
            ["launchctl", "bootout", service_target],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            print(f"Warning: Error unloading server service: {result.stderr}")

    # Remove plist file
    plist_path.unlink()
    print("ulogme web server launchd service uninstalled")


def status() -> None:
    """Print the status of the launchd service."""
    plist_path = get_plist_path()

    if not plist_path.exists():
        print("ulogme is not installed as a launchd service")
        print("Run 'uv run python -m tracker install' to install")
        return

    print(f"Plist: {plist_path}")

    uid = os.getuid()
    service_target = f"gui/{uid}/{PLIST_LABEL}"

    if is_loaded():
        print("Status: loaded and running")

        # Get more info
        result = subprocess.run(
            ["launchctl", "print", service_target],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            for line in result.stdout.strip().split("\n"):
                if "pid" in line.lower() or "state" in line.lower():
                    print(f"  {line.strip()}")
    else:
        print("Status: installed but not loaded")
        print(f"Run 'launchctl bootstrap gui/{uid} {plist_path}' to start")


def status_server() -> None:
    """Print the status of the web server launchd service."""
    plist_path = get_plist_path_server()

    if not plist_path.exists():
        print("ulogme web server is not installed as a launchd service")
        print("Run 'uv run python -m tracker install-server' to install")
        return

    print(f"Plist: {plist_path}")

    uid = os.getuid()
    service_target = f"gui/{uid}/{PLIST_LABEL_SERVER}"

    if is_loaded_server():
        print("Status: loaded and running")
        print("  Dashboard: http://localhost:5173")

        # Get more info
        result = subprocess.run(
            ["launchctl", "print", service_target],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            for line in result.stdout.strip().split("\n"):
                if "pid" in line.lower() or "state" in line.lower():
                    print(f"  {line.strip()}")
    else:
        print("Status: installed but not loaded")
        print(f"Run 'launchctl bootstrap gui/{uid} {plist_path}' to start")

