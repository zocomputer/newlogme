"""
Active window monitoring for macOS using PyObjC.

Uses NSWorkspace notifications to track application switches and
CGWindowListCopyWindowInfo for window titles.
"""

from datetime import datetime
from typing import Callable

from AppKit import NSWorkspace
from Foundation import NSAppleScript, NSObject
from Quartz import (
    CGWindowListCopyWindowInfo,
    kCGWindowListOptionOnScreenOnly,
    kCGNullWindowID,
)

from .config import Config
from .storage import Storage
from .utils import rewind_to_logical_day, remove_non_ascii


class WindowTracker:
    """
    Tracks the active window on macOS.
    
    Uses NSWorkspace notifications to detect app switches and queries
    window information via Quartz APIs.
    """
    
    def __init__(self, config: Config, storage: Storage):
        self.config = config
        self.storage = storage
        self.current_app: str | None = None
        self.last_logged: str | None = None
        self._chrome_script: NSAppleScript | None = None
        self._safari_script: NSAppleScript | None = None
        self._arc_script: NSAppleScript | None = None
    
    def _get_chrome_url_script(self) -> NSAppleScript:
        """Get cached AppleScript for Chrome URL."""
        if self._chrome_script is None:
            self._chrome_script = NSAppleScript.alloc().initWithSource_(
                """
                tell application "Google Chrome"
                    if (count of windows) > 0 then
                        get URL of active tab of first window
                    end if
                end tell
                """
            )
        return self._chrome_script
    
    def _get_safari_url_script(self) -> NSAppleScript:
        """Get cached AppleScript for Safari URL."""
        if self._safari_script is None:
            self._safari_script = NSAppleScript.alloc().initWithSource_(
                """
                tell application "Safari"
                    if (count of windows) > 0 then
                        get URL of current tab of first window
                    end if
                end tell
                """
            )
        return self._safari_script
    
    def _get_arc_url_script(self) -> NSAppleScript:
        """Get cached AppleScript for Arc URL."""
        if self._arc_script is None:
            self._arc_script = NSAppleScript.alloc().initWithSource_(
                """
                tell application "Arc"
                    if (count of windows) > 0 then
                        get URL of active tab of first window
                    end if
                end tell
                """
            )
        return self._arc_script
    
    def get_browser_url(self, app_name: str) -> str | None:
        """
        Get the current URL from a browser application.
        
        Only works if the browser is running and has at least one window.
        """
        if not self.config.browser_urls:
            return None
        
        script: NSAppleScript | None = None
        
        if "Chrome" in app_name:
            script = self._get_chrome_url_script()
        elif "Safari" in app_name:
            script = self._get_safari_url_script()
        elif "Arc" in app_name:
            script = self._get_arc_url_script()
        
        if script is None:
            return None
        
        try:
            result, error = script.executeAndReturnError_(None)
            if result is not None:
                return str(result.stringValue())
        except Exception:
            pass
        
        return None
    
    def get_current_window_name(self) -> str | None:
        """
        Get the name of the current window for the active application.
        
        Uses CGWindowListCopyWindowInfo to query all on-screen windows.
        """
        if not self.config.window_titles:
            return None
        
        if self.current_app is None:
            return None
        
        try:
            window_list = CGWindowListCopyWindowInfo(
                kCGWindowListOptionOnScreenOnly,
                kCGNullWindowID,
            )
            
            if window_list is None:
                return None
            
            for window in window_list:
                try:
                    owner = window.get("kCGWindowOwnerName")
                    if owner == self.current_app:
                        name = window.get("kCGWindowName")
                        if name:
                            return str(name)
                except (KeyError, TypeError):
                    pass
        except Exception:
            pass
        
        return None
    
    def set_active_app(self, app_name: str | None) -> None:
        """Update the current active application."""
        self.current_app = remove_non_ascii(app_name)
    
    def handle_screen_sleep(self) -> None:
        """Handle screen sleep/lock event."""
        self.current_app = "__LOCKEDSCREEN"
        self._log_current_window()
    
    def _log_current_window(self) -> None:
        """Log the current window to storage if it has changed."""
        if self.current_app is None:
            return
        
        # Get window title
        window_title = self.get_current_window_name()
        window_title = remove_non_ascii(window_title)
        
        # Get browser URL if applicable
        browser_url: str | None = None
        if self.current_app in ("Google Chrome", "Safari", "Arc", "Firefox", "Brave"):
            browser_url = self.get_browser_url(self.current_app)
            # For browsers, use URL as window title if enabled
            if self.config.browser_tabs and browser_url:
                window_title = remove_non_ascii(browser_url)
        
        # Build the name to log
        if window_title and len(window_title) > 0:
            name_to_log = f"{self.current_app} :: {window_title}"
        else:
            name_to_log = self.current_app
        
        # Only log if changed
        if name_to_log == self.last_logged:
            return
        
        self.last_logged = name_to_log
        
        # Calculate logical date and save
        now = datetime.now()
        logical_date = rewind_to_logical_day(
            int(now.timestamp()),
            self.config.day_boundary_hour
        )
        
        self.storage.insert_window_event(
            timestamp=now,
            app_name=self.current_app,
            window_title=window_title,
            browser_url=browser_url,
            logical_date=logical_date,
        )
    
    def poll(self) -> None:
        """Poll and log the current window. Called periodically by the daemon."""
        self._log_current_window()


class WindowObserver(NSObject):
    """
    NSObject subclass that receives notifications about application changes.
    """
    
    tracker: WindowTracker | None = None
    
    def applicationActivated_(self, notification) -> None:
        """Handle NSWorkspaceDidActivateApplicationNotification."""
        if self.tracker is None:
            return
        
        try:
            app = notification.userInfo().objectForKey_("NSWorkspaceApplicationKey")
            if app is not None:
                self.tracker.set_active_app(app.localizedName())
        except Exception:
            pass
    
    def screenDidSleep_(self, notification) -> None:
        """Handle NSWorkspaceScreensDidSleepNotification."""
        if self.tracker is None:
            return
        self.tracker.handle_screen_sleep()


def setup_window_tracking(tracker: WindowTracker) -> WindowObserver:
    """
    Set up NSWorkspace notifications for window tracking.
    
    Returns the observer object (must be kept alive).
    """
    workspace = NSWorkspace.sharedWorkspace()
    notification_center = workspace.notificationCenter()
    
    observer = WindowObserver.alloc().init()
    observer.tracker = tracker
    
    # Subscribe to application activation
    notification_center.addObserver_selector_name_object_(
        observer,
        "applicationActivated:",
        "NSWorkspaceDidActivateApplicationNotification",
        None,
    )
    
    # Subscribe to screen sleep (lock)
    notification_center.addObserver_selector_name_object_(
        observer,
        "screenDidSleep:",
        "NSWorkspaceScreensDidSleepNotification",
        None,
    )
    
    # Get initial active app
    running_app = workspace.frontmostApplication()
    if running_app is not None:
        tracker.set_active_app(running_app.localizedName())
    
    return observer

