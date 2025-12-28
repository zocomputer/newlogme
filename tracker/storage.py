"""
DuckDB storage layer for ulogme.
"""

import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

import duckdb

from .config import Config


# Schema version for migrations
SCHEMA_VERSION = 1


def get_connection(config: Config) -> duckdb.DuckDBPyConnection:
    """
    Get a DuckDB connection, creating the database if needed.
    
    Args:
        config: The configuration with database path
    
    Returns:
        A DuckDB connection
    """
    db_path = config.absolute_db_path
    
    # Ensure the directory exists
    db_path.parent.mkdir(parents=True, exist_ok=True)
    
    conn = duckdb.connect(str(db_path))
    
    # Initialize schema if needed
    _ensure_schema(conn)
    
    return conn


def _ensure_schema(conn: duckdb.DuckDBPyConnection) -> None:
    """Ensure the database schema exists and is up to date."""
    
    # Check if we need to create tables
    tables = conn.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
    ).fetchall()
    table_names = {t[0] for t in tables}
    
    if "window_events" not in table_names:
        conn.execute("""
            CREATE TABLE window_events (
                timestamp TIMESTAMP NOT NULL,
                app_name VARCHAR NOT NULL,
                window_title VARCHAR,
                browser_url VARCHAR,
                logical_date DATE NOT NULL,
                PRIMARY KEY (timestamp, app_name)
            )
        """)
        conn.execute("CREATE INDEX idx_window_logical_date ON window_events(logical_date)")
    
    if "key_events" not in table_names:
        conn.execute("""
            CREATE TABLE key_events (
                timestamp TIMESTAMP NOT NULL PRIMARY KEY,
                key_count INTEGER NOT NULL,
                logical_date DATE NOT NULL
            )
        """)
        conn.execute("CREATE INDEX idx_key_logical_date ON key_events(logical_date)")
    
    if "notes" not in table_names:
        conn.execute("""
            CREATE TABLE notes (
                timestamp TIMESTAMP NOT NULL PRIMARY KEY,
                content VARCHAR NOT NULL,
                logical_date DATE NOT NULL
            )
        """)
        conn.execute("CREATE INDEX idx_notes_logical_date ON notes(logical_date)")
    
    if "daily_blog" not in table_names:
        conn.execute("""
            CREATE TABLE daily_blog (
                logical_date DATE PRIMARY KEY,
                content VARCHAR
            )
        """)
    
    if "settings" not in table_names:
        conn.execute("""
            CREATE TABLE settings (
                key VARCHAR PRIMARY KEY,
                value JSON
            )
        """)
        # Initialize with default settings
        conn.execute("""
            INSERT INTO settings (key, value) VALUES 
            ('schema_version', ?::JSON)
        """, [json.dumps(SCHEMA_VERSION)])


class Storage:
    """Storage interface for ulogme data."""
    
    def __init__(self, config: Config):
        self.config = config
        self._conn: duckdb.DuckDBPyConnection | None = None
    
    @property
    def conn(self) -> duckdb.DuckDBPyConnection:
        """Get or create the database connection."""
        if self._conn is None:
            self._conn = get_connection(self.config)
        return self._conn
    
    def close(self) -> None:
        """Close the database connection."""
        if self._conn is not None:
            self._conn.close()
            self._conn = None
    
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
        self.conn.execute(
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
        result = self.conn.execute(
            """
            SELECT timestamp, app_name, window_title, browser_url
            FROM window_events
            WHERE logical_date = ?
            ORDER BY timestamp
            """,
            [logical_date],
        ).fetchall()
        
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
        result = self.conn.execute(
            """
            SELECT timestamp, app_name, window_title, browser_url
            FROM window_events
            ORDER BY timestamp DESC
            LIMIT 1
            """
        ).fetchone()
        
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
        self.conn.execute(
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
        result = self.conn.execute(
            """
            SELECT timestamp, key_count
            FROM key_events
            WHERE logical_date = ?
            ORDER BY timestamp
            """,
            [logical_date],
        ).fetchall()
        
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
        self.conn.execute(
            """
            INSERT INTO notes (timestamp, content, logical_date)
            VALUES (?, ?, ?)
            ON CONFLICT (timestamp) DO UPDATE SET content = excluded.content
            """,
            [timestamp, content, logical_date],
        )
    
    def get_notes_for_date(self, logical_date: date) -> list[dict[str, Any]]:
        """Get all notes for a logical date."""
        result = self.conn.execute(
            """
            SELECT timestamp, content
            FROM notes
            WHERE logical_date = ?
            ORDER BY timestamp
            """,
            [logical_date],
        ).fetchall()
        
        return [
            {"timestamp": row[0], "content": row[1]}
            for row in result
        ]
    
    # Daily blog
    
    def save_blog(self, logical_date: date, content: str) -> None:
        """Save the daily blog entry."""
        self.conn.execute(
            """
            INSERT INTO daily_blog (logical_date, content)
            VALUES (?, ?)
            ON CONFLICT (logical_date) DO UPDATE SET content = excluded.content
            """,
            [logical_date, content],
        )
    
    def get_blog(self, logical_date: date) -> str | None:
        """Get the daily blog entry."""
        result = self.conn.execute(
            """
            SELECT content FROM daily_blog WHERE logical_date = ?
            """,
            [logical_date],
        ).fetchone()
        
        return result[0] if result else None
    
    # Settings
    
    def get_setting(self, key: str) -> Any:
        """Get a setting value."""
        result = self.conn.execute(
            "SELECT value FROM settings WHERE key = ?",
            [key],
        ).fetchone()
        
        if result is None:
            return None
        
        return json.loads(result[0])
    
    def set_setting(self, key: str, value: Any) -> None:
        """Set a setting value."""
        self.conn.execute(
            """
            INSERT INTO settings (key, value)
            VALUES (?, ?::JSON)
            ON CONFLICT (key) DO UPDATE SET value = excluded.value
            """,
            [key, json.dumps(value)],
        )
    
    # Aggregation queries
    
    def get_available_dates(self) -> list[date]:
        """Get all dates that have data."""
        result = self.conn.execute(
            """
            SELECT DISTINCT logical_date
            FROM (
                SELECT logical_date FROM window_events
                UNION
                SELECT logical_date FROM key_events
            )
            ORDER BY logical_date DESC
            """
        ).fetchall()
        
        return [row[0] for row in result]
    
    def get_daily_summary(self, logical_date: date) -> dict[str, Any]:
        """Get a summary of activity for a specific date."""
        # Get total keystrokes
        key_result = self.conn.execute(
            """
            SELECT COALESCE(SUM(key_count), 0) as total_keys,
                   COUNT(*) as key_events
            FROM key_events
            WHERE logical_date = ?
            """,
            [logical_date],
        ).fetchone()
        
        # Get app usage
        app_result = self.conn.execute(
            """
            SELECT app_name, COUNT(*) as event_count
            FROM window_events
            WHERE logical_date = ?
            GROUP BY app_name
            ORDER BY event_count DESC
            """,
            [logical_date],
        ).fetchall()
        
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
        
        result = self.conn.execute(query, params).fetchall()
        
        return [
            {
                "logical_date": row[0],
                "total_keys": row[1],
                "unique_apps": row[2],
            }
            for row in result
        ]

