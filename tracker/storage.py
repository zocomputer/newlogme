"""
SQLite storage layer for ulogme.
"""

import json
import sqlite3
from datetime import date, datetime
from pathlib import Path
from typing import Any

from .config import Config

# Register adapters so sqlite3 knows how to bind datetime/date params
sqlite3.register_adapter(datetime, lambda dt: dt.isoformat())
sqlite3.register_adapter(date, lambda d: d.isoformat())

# Schema version for migrations
SCHEMA_VERSION = 1


def get_connection(config: Config) -> sqlite3.Connection:
    """
    Get a SQLite connection, creating the database if needed.

    Args:
        config: The configuration with database path

    Returns:
        A SQLite connection
    """
    db_path = config.absolute_db_path

    # Ensure the directory exists
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")

    # Initialize schema if needed
    _ensure_schema(conn)

    return conn


def _ensure_schema(conn: sqlite3.Connection) -> None:
    """Ensure the database schema exists and is up to date."""

    # Check if we need to create tables
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()
    table_names = {t[0] for t in tables}

    if "window_events" not in table_names:
        conn.execute("""
            CREATE TABLE window_events (
                timestamp TEXT NOT NULL,
                app_name TEXT NOT NULL,
                window_title TEXT,
                browser_url TEXT,
                logical_date TEXT NOT NULL,
                PRIMARY KEY (timestamp, app_name)
            )
        """)
        conn.execute("CREATE INDEX idx_window_logical_date ON window_events(logical_date)")

    if "key_events" not in table_names:
        conn.execute("""
            CREATE TABLE key_events (
                timestamp TEXT NOT NULL PRIMARY KEY,
                key_count INTEGER NOT NULL,
                logical_date TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX idx_key_logical_date ON key_events(logical_date)")

    if "notes" not in table_names:
        conn.execute("""
            CREATE TABLE notes (
                timestamp TEXT NOT NULL PRIMARY KEY,
                content TEXT NOT NULL,
                logical_date TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX idx_notes_logical_date ON notes(logical_date)")

    if "daily_blog" not in table_names:
        conn.execute("""
            CREATE TABLE daily_blog (
                logical_date TEXT PRIMARY KEY,
                content TEXT
            )
        """)

    if "settings" not in table_names:
        conn.execute("""
            CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        # Initialize with default settings
        conn.execute("""
            INSERT INTO settings (key, value) VALUES
            ('schema_version', ?)
        """, [json.dumps(SCHEMA_VERSION)])

    conn.commit()


class Storage:
    """Storage interface for ulogme data.

    Opens and closes the database connection for each operation to allow
    concurrent read access from the web server.
    """

    def __init__(self, config: Config):
        self.config = config
        self._schema_initialized = False

    def _get_conn(self) -> sqlite3.Connection:
        """Get a fresh database connection."""
        conn = get_connection(self.config)
        return conn

    def _execute(self, query: str, params: list | None = None) -> None:
        """Execute a write query, opening and closing the connection."""
        conn = self._get_conn()
        try:
            if params:
                conn.execute(query, params)
            else:
                conn.execute(query)
            conn.commit()
        finally:
            conn.close()

    def _query(self, query: str, params: list | None = None):
        """Execute a read query, returning results."""
        conn = self._get_conn()
        try:
            if params:
                return conn.execute(query, params).fetchall()
            else:
                return conn.execute(query).fetchall()
        finally:
            conn.close()

    def _query_one(self, query: str, params: list | None = None):
        """Execute a read query, returning one result."""
        conn = self._get_conn()
        try:
            if params:
                return conn.execute(query, params).fetchone()
            else:
                return conn.execute(query).fetchone()
        finally:
            conn.close()

    def close(self) -> None:
        """Close any resources (no-op now, connections are closed after each operation)."""
        pass

    # Window events

    def insert_window_event(
        self,
        timestamp: datetime,
        app_name: str,
        logical_date: date,
        window_title: str | None = None,
        browser_url: str | None = None,
    ) -> None:
        """Insert a window event."""
        self._execute(
            """
            INSERT INTO window_events (timestamp, app_name, window_title, browser_url, logical_date)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (timestamp, app_name) DO UPDATE SET
                window_title = excluded.window_title,
                browser_url = excluded.browser_url
            """,
            [timestamp, app_name, window_title, browser_url, logical_date],
        )

    def get_window_events_for_date(self, logical_date: date) -> list[dict[str, Any]]:
        """Get all window events for a logical date."""
        result = self._query(
            """
            SELECT timestamp, app_name, window_title, browser_url
            FROM window_events
            WHERE logical_date = ?
            ORDER BY timestamp
            """,
            [logical_date],
        )

        return [
            {
                "timestamp": row[0],
                "app_name": row[1],
                "window_title": row[2],
                "browser_url": row[3],
            }
            for row in result
        ]

    def get_last_window_event(self) -> dict[str, Any] | None:
        """Get the most recent window event."""
        result = self._query_one(
            """
            SELECT timestamp, app_name, window_title, browser_url
            FROM window_events
            ORDER BY timestamp DESC
            LIMIT 1
            """
        )

        if result is None:
            return None

        return {
            "timestamp": result[0],
            "app_name": result[1],
            "window_title": result[2],
            "browser_url": result[3],
        }

    # Key events

    def insert_key_event(
        self,
        timestamp: datetime,
        key_count: int,
        logical_date: date,
    ) -> None:
        """Insert a keystroke count event."""
        self._execute(
            """
            INSERT INTO key_events (timestamp, key_count, logical_date)
            VALUES (?, ?, ?)
            ON CONFLICT (timestamp) DO UPDATE SET
                key_count = key_events.key_count + excluded.key_count
            """,
            [timestamp, key_count, logical_date],
        )

    def get_key_events_for_date(self, logical_date: date) -> list[dict[str, Any]]:
        """Get all key events for a logical date."""
        result = self._query(
            """
            SELECT timestamp, key_count
            FROM key_events
            WHERE logical_date = ?
            ORDER BY timestamp
            """,
            [logical_date],
        )

        return [
            {"timestamp": row[0], "key_count": row[1]}
            for row in result
        ]

    # Notes

    def insert_note(
        self,
        timestamp: datetime,
        content: str,
        logical_date: date,
    ) -> None:
        """Insert a note."""
        self._execute(
            """
            INSERT INTO notes (timestamp, content, logical_date)
            VALUES (?, ?, ?)
            ON CONFLICT (timestamp) DO UPDATE SET content = excluded.content
            """,
            [timestamp, content, logical_date],
        )

    def get_notes_for_date(self, logical_date: date) -> list[dict[str, Any]]:
        """Get all notes for a logical date."""
        result = self._query(
            """
            SELECT timestamp, content
            FROM notes
            WHERE logical_date = ?
            ORDER BY timestamp
            """,
            [logical_date],
        )

        return [
            {"timestamp": row[0], "content": row[1]}
            for row in result
        ]

    # Daily blog

    def save_blog(self, logical_date: date, content: str) -> None:
        """Save the daily blog entry."""
        self._execute(
            """
            INSERT INTO daily_blog (logical_date, content)
            VALUES (?, ?)
            ON CONFLICT (logical_date) DO UPDATE SET content = excluded.content
            """,
            [logical_date, content],
        )

    def get_blog(self, logical_date: date) -> str | None:
        """Get the daily blog entry."""
        result = self._query_one(
            """
            SELECT content FROM daily_blog WHERE logical_date = ?
            """,
            [logical_date],
        )

        return result[0] if result else None

    # Settings

    def get_setting(self, key: str) -> Any:
        """Get a setting value."""
        result = self._query_one(
            "SELECT value FROM settings WHERE key = ?",
            [key],
        )

        if result is None:
            return None

        return json.loads(result[0])

    def set_setting(self, key: str, value: Any) -> None:
        """Set a setting value."""
        self._execute(
            """
            INSERT INTO settings (key, value)
            VALUES (?, ?)
            ON CONFLICT (key) DO UPDATE SET value = excluded.value
            """,
            [key, json.dumps(value)],
        )

    # Aggregation queries

    def get_available_dates(self) -> list[date]:
        """Get all dates that have data."""
        result = self._query(
            """
            SELECT DISTINCT logical_date
            FROM (
                SELECT logical_date FROM window_events
                UNION
                SELECT logical_date FROM key_events
            )
            ORDER BY logical_date DESC
            """
        )

        return [date.fromisoformat(row[0]) for row in result]

    def get_daily_summary(self, logical_date: date) -> dict[str, Any]:
        """Get a summary of activity for a specific date."""
        # Get total keystrokes
        key_result = self._query_one(
            """
            SELECT COALESCE(SUM(key_count), 0) as total_keys,
                   COUNT(*) as key_events
            FROM key_events
            WHERE logical_date = ?
            """,
            [logical_date],
        )

        # Get app usage
        app_result = self._query(
            """
            SELECT app_name, COUNT(*) as event_count
            FROM window_events
            WHERE logical_date = ?
            GROUP BY app_name
            ORDER BY event_count DESC
            """,
            [logical_date],
        )

        return {
            "logical_date": logical_date,
            "total_keys": key_result[0] if key_result else 0,
            "key_events": key_result[1] if key_result else 0,
            "app_usage": [
                {"app_name": row[0], "event_count": row[1]}
                for row in app_result
            ],
        }

    def get_overview(
        self,
        from_date: date | None = None,
        to_date: date | None = None,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        """Get overview statistics for a date range."""
        query = """
            SELECT
                logical_date,
                COALESCE(
                    (SELECT SUM(key_count) FROM key_events k WHERE k.logical_date = w.logical_date),
                    0
                ) as total_keys,
                COUNT(DISTINCT app_name) as unique_apps
            FROM window_events w
        """
        params: list[Any] = []

        if from_date or to_date:
            conditions = []
            if from_date:
                conditions.append("logical_date >= ?")
                params.append(from_date)
            if to_date:
                conditions.append("logical_date <= ?")
                params.append(to_date)
            query += " WHERE " + " AND ".join(conditions)

        query += f"""
            GROUP BY logical_date
            ORDER BY logical_date DESC
            LIMIT {limit}
        """

        result = self._query(query, params)

        return [
            {
                "logical_date": row[0],
                "total_keys": row[1],
                "unique_apps": row[2],
            }
            for row in result
        ]
