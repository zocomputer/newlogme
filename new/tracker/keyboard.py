"""
Keystroke counting for macOS using PyObjC.

Uses NSEvent global monitors to count keystrokes. Privacy-first design:
only counts keystrokes, never logs actual key values.
"""

import threading
import time
from datetime import datetime
from typing import Any

from AppKit import NSEvent, NSKeyDownMask

from .config import Config
from .storage import Storage
from .utils import rewind_to_logical_day


class KeystrokeCounter:
    """
    Counts keystrokes without logging actual key values.
    
    Aggregates counts over a configurable window (default 9 seconds) and
    writes to storage.
    """
    
    def __init__(self, config: Config, storage: Storage):
        self.config = config
        self.storage = storage
        self._count = 0
        self._lock = threading.Lock()
        self._last_flush = time.time()
        self._monitor: Any = None
        self._running = False
    
    def _handle_key_event(self, event) -> None:
        """Handle a key down event by incrementing the counter."""
        if event.type() == 10:  # NSKeyDown = 10
            with self._lock:
                self._count += 1
    
    def _flush_if_needed(self) -> None:
        """Flush the current count to storage if the window has elapsed."""
        now = time.time()
        elapsed = now - self._last_flush
        
        if elapsed >= self.config.keystroke_window:
            with self._lock:
                count = self._count
                self._count = 0
                self._last_flush = now
            
            if count > 0:
                timestamp = datetime.now()
                logical_date = rewind_to_logical_day(
                    int(timestamp.timestamp()),
                    self.config.day_boundary_hour
                )
                
                self.storage.insert_key_event(
                    timestamp=timestamp,
                    key_count=count,
                    logical_date=logical_date,
                )
    
    def poll(self) -> None:
        """Check if we need to flush. Called periodically by the daemon."""
        self._flush_if_needed()


def setup_keystroke_monitoring(counter: KeystrokeCounter) -> Any:
    """
    Set up global keystroke monitoring.
    
    Requires Accessibility permission in System Settings.
    
    Returns the event monitor (must be kept alive).
    """
    # NSKeyDownMask for key down events
    mask = NSKeyDownMask
    
    # Add global monitor (catches events in other apps)
    monitor = NSEvent.addGlobalMonitorForEventsMatchingMask_handler_(
        mask,
        counter._handle_key_event,
    )
    
    counter._monitor = monitor
    counter._running = True
    
    return monitor


def remove_keystroke_monitoring(counter: KeystrokeCounter) -> None:
    """Remove the keystroke monitor."""
    if counter._monitor is not None:
        NSEvent.removeMonitor_(counter._monitor)
        counter._monitor = None
        counter._running = False

