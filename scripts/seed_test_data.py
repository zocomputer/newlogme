#!/usr/bin/env python3
"""
Seed the database with sample data for testing the UI.
"""

import sys
import random
from datetime import datetime, date, timedelta
from pathlib import Path

# Add the new directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from tracker.config import load_config
from tracker.storage import Storage

APPS = [
    ("Cursor", "window.py — ulogme"),
    ("Cursor", "storage.py — ulogme"),
    ("Cursor", "daemon.py — ulogme"),
    ("Google Chrome", "https://github.com/karpathy/ulogme"),
    ("Google Chrome", "https://docs.python.org/3/"),
    ("Google Chrome", "https://duckdb.org/docs/api/overview"),
    ("Terminal", "zsh"),
    ("iTerm2", "uv run python -m tracker"),
    ("Slack", "DM with teammate"),
    ("Slack", "#engineering channel"),
    ("Finder", "~/code/ulogme"),
    ("Safari", "https://news.ycombinator.com"),
    ("Notes", "Ideas for project"),
    ("__LOCKEDSCREEN", None),
]


def seed_data(days: int = 7):
    """Seed the database with sample data."""
    config = load_config()
    storage = Storage(config)
    
    print(f"Seeding {days} days of test data...")
    print(f"Database: {config.absolute_db_path}")
    
    today = date.today()
    
    for day_offset in range(days):
        logical_date = today - timedelta(days=day_offset)
        
        # Generate window events throughout the day (7am to 11pm)
        current_time = datetime.combine(logical_date, datetime.min.time().replace(hour=7))
        end_time = datetime.combine(logical_date, datetime.min.time().replace(hour=23))
        
        event_count = 0
        while current_time < end_time:
            # Pick a random app
            app_name, window_title = random.choice(APPS)
            
            # Some variation in browser URLs
            browser_url = None
            if app_name in ("Google Chrome", "Safari"):
                browser_url = window_title
            
            storage.insert_window_event(
                timestamp=current_time,
                app_name=app_name,
                window_title=window_title,
                browser_url=browser_url,
                logical_date=logical_date,
            )
            
            event_count += 1
            
            # Add random interval (30 seconds to 10 minutes)
            current_time += timedelta(seconds=random.randint(30, 600))
        
        # Generate keystroke events (every 9 seconds of "active" time)
        current_time = datetime.combine(logical_date, datetime.min.time().replace(hour=7))
        key_count = 0
        while current_time < end_time:
            # Some time slots have more keystrokes (work hours)
            hour = current_time.hour
            if 9 <= hour <= 12 or 14 <= hour <= 18:
                # High activity period
                count = random.randint(20, 80)
            elif 7 <= hour <= 9 or 12 <= hour <= 14:
                # Medium activity
                count = random.randint(5, 30)
            else:
                # Low activity or breaks
                count = random.randint(0, 15)
            
            if count > 0:
                storage.insert_key_event(
                    timestamp=current_time,
                    key_count=count,
                    logical_date=logical_date,
                )
                key_count += count
            
            # 9 second intervals
            current_time += timedelta(seconds=9)
        
        # Add a few notes
        note_time = datetime.combine(logical_date, datetime.min.time().replace(hour=10, minute=30))
        storage.insert_note(
            timestamp=note_time,
            content="Started work on the rewrite",
            logical_date=logical_date,
        )
        
        note_time = datetime.combine(logical_date, datetime.min.time().replace(hour=12))
        storage.insert_note(
            timestamp=note_time,
            content="Lunch break",
            logical_date=logical_date,
        )
        
        # Add blog entry
        storage.save_blog(
            logical_date=logical_date,
            content=f"Day {day_offset + 1} of working on the ulogme rewrite. Made good progress on the tracker daemon and frontend components."
        )
        
        print(f"  {logical_date}: {event_count} window events, {key_count} keystrokes")
    
    storage.close()
    print("\nDone! You can now start the web UI to see the data.")


if __name__ == "__main__":
    seed_data()

