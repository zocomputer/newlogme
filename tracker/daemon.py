"""
Main daemon for ulogme tracker.

Runs the event loop for macOS, coordinating window tracking and keystroke
counting.
"""

import os
import signal
import sys
import threading
import time
from pathlib import Path
from typing import Any

from AppKit import NSApplication, NSApplicationActivationPolicyAccessory
from Foundation import NSTimer, NSObject
from PyObjCTools import AppHelper

from .config import Config, load_config
from .storage import Storage
from .window import WindowTracker, setup_window_tracking
from .keyboard import KeystrokeCounter, setup_keystroke_monitoring, remove_keystroke_monitoring


class DaemonDelegate(NSObject):
    """NSApplication delegate for the daemon."""
    
    tracker: WindowTracker | None = None
    counter: KeystrokeCounter | None = None
    verbose: bool = False
    
    def applicationDidFinishLaunching_(self, notification) -> None:
        """Called when the application has finished launching."""
        pass
    
    def pollCallback_(self, timer) -> None:
        """Periodic callback for polling window and flushing keystrokes."""
        if self.verbose:
            from datetime import datetime
            print(f"[{datetime.now().strftime('%H:%M:%S')}] poll tick", flush=True)
        if self.tracker is not None:
            self.tracker.poll()
        if self.counter is not None:
            self.counter.poll()


class Daemon:
    """
    The main daemon class that coordinates all tracking.
    """
    
    def __init__(self, config: Config, verbose: bool = False):
        self.config = config
        self.verbose = verbose
        self.storage = Storage(config)
        self.tracker = WindowTracker(config, self.storage)
        self.tracker.verbose = verbose
        self.counter = KeystrokeCounter(config, self.storage)
        self.counter.verbose = verbose
        self._running = False
        self._observer: Any = None
        self._key_monitor: Any = None
        self._delegate: DaemonDelegate | None = None
    
    def start(self) -> None:
        """Start the daemon and run the event loop."""
        self._running = True
        
        # Set up signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        # Initialize NSApplication as an accessory app (no dock icon, works in background)
        app = NSApplication.sharedApplication()
        app.setActivationPolicy_(NSApplicationActivationPolicyAccessory)
        
        # Create delegate
        self._delegate = DaemonDelegate.alloc().init()
        self._delegate.tracker = self.tracker
        self._delegate.counter = self.counter
        self._delegate.verbose = self.verbose
        
        app.setDelegate_(self._delegate)
        
        # Set up window tracking
        self._observer = setup_window_tracking(self.tracker)
        
        # Set up keystroke monitoring if enabled
        if self.config.keystrokes:
            self._key_monitor = setup_keystroke_monitoring(self.counter)
        
        # Set up periodic timer for polling
        NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(
            self.config.window_poll_interval,
            self._delegate,
            "pollCallback:",
            None,
            True,
        )
        
        print(f"ulogme daemon started (PID: {os.getpid()})", flush=True)
        print(f"Database: {self.config.absolute_db_path}", flush=True)
        print(f"Window tracking: {'enabled' if self.config.window_titles else 'disabled'}", flush=True)
        print(f"Keystroke counting: {'enabled' if self.config.keystrokes else 'disabled'}", flush=True)
        sys.stdout.flush()
        
        # Run the event loop
        try:
            AppHelper.runEventLoop()
        except KeyboardInterrupt:
            pass
        finally:
            self.stop()
    
    def stop(self) -> None:
        """Stop the daemon."""
        if not self._running:
            return
        
        self._running = False
        print("\nStopping ulogme daemon...")
        
        # Clean up keystroke monitoring
        if self.config.keystrokes:
            remove_keystroke_monitoring(self.counter)
        
        # Flush any remaining keystrokes
        self.counter.poll()
        
        # Close storage
        self.storage.close()
        
        # Stop the event loop
        AppHelper.stopEventLoop()
        
        print("ulogme daemon stopped")
    
    def _signal_handler(self, signum, frame) -> None:
        """Handle shutdown signals."""
        self.stop()
        sys.exit(0)


def get_pid_file(config: Config) -> Path:
    """Get the path to the PID file."""
    return config.absolute_db_path.parent / "tracker.pid"


def is_running(config: Config) -> tuple[bool, int | None]:
    """Check if the daemon is already running."""
    pid_file = get_pid_file(config)
    
    if not pid_file.exists():
        return False, None
    
    try:
        pid = int(pid_file.read_text().strip())
        # Check if process is still running
        os.kill(pid, 0)
        return True, pid
    except (ValueError, ProcessLookupError, PermissionError):
        # PID file exists but process is not running
        pid_file.unlink(missing_ok=True)
        return False, None


def write_pid_file(config: Config) -> None:
    """Write the current PID to the PID file."""
    pid_file = get_pid_file(config)
    pid_file.parent.mkdir(parents=True, exist_ok=True)
    pid_file.write_text(str(os.getpid()))


def remove_pid_file(config: Config) -> None:
    """Remove the PID file."""
    pid_file = get_pid_file(config)
    pid_file.unlink(missing_ok=True)


def run_daemon(config: Config | None = None, verbose: bool = False) -> None:
    """
    Run the daemon in the foreground.
    
    Args:
        config: Configuration to use. If None, loads from default location.
        verbose: If True, print debug output
    """
    if config is None:
        config = load_config()
    
    # Check if already running
    running, pid = is_running(config)
    if running:
        print(f"ulogme daemon is already running (PID: {pid})")
        sys.exit(1)
    
    # Write PID file
    write_pid_file(config)
    
    try:
        daemon = Daemon(config, verbose=verbose)
        daemon.start()
    finally:
        remove_pid_file(config)


def stop_daemon(config: Config | None = None) -> None:
    """
    Stop the running daemon.
    
    Args:
        config: Configuration to use. If None, loads from default location.
    """
    if config is None:
        config = load_config()
    
    running, pid = is_running(config)
    
    if not running:
        print("ulogme daemon is not running")
        return
    
    if pid is not None:
        print(f"Stopping ulogme daemon (PID: {pid})...")
        try:
            os.kill(pid, signal.SIGTERM)
            
            # Wait for process to stop
            for _ in range(10):
                time.sleep(0.5)
                try:
                    os.kill(pid, 0)
                except ProcessLookupError:
                    print("ulogme daemon stopped")
                    remove_pid_file(config)
                    return
            
            # Force kill if still running
            os.kill(pid, signal.SIGKILL)
            print("ulogme daemon killed")
            remove_pid_file(config)
        except ProcessLookupError:
            print("ulogme daemon was already stopped")
            remove_pid_file(config)
        except PermissionError:
            print(f"Permission denied stopping process {pid}")
            sys.exit(1)


def check_status(config: Config | None = None) -> None:
    """
    Print the status of the daemon.
    
    Args:
        config: Configuration to use. If None, loads from default location.
    """
    if config is None:
        config = load_config()
    
    running, pid = is_running(config)
    
    if running:
        print(f"ulogme daemon is running (PID: {pid})")
        print(f"Database: {config.absolute_db_path}")
    else:
        print("ulogme daemon is not running")

