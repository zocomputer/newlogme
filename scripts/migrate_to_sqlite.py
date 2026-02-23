"""
One-time migration script: DuckDB → SQLite.

Usage:
    uv run python scripts/migrate_to_sqlite.py

Reads from data/ulogme.duckdb (DuckDB) and writes to data/ulogme.db (SQLite).
The DuckDB file is not modified or deleted.
"""

import sqlite3
import sys
from datetime import date, datetime
from pathlib import Path

try:
    import duckdb
except ImportError:
    print("duckdb is required for migration. Install it first: uv pip install duckdb")
    sys.exit(1)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DUCKDB_PATH = PROJECT_ROOT / "data" / "ulogme.duckdb"
SQLITE_PATH = PROJECT_ROOT / "data" / "ulogme.db"


def to_iso(value):
    """Convert a value to ISO string if it's a date/datetime."""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


def migrate():
    if not DUCKDB_PATH.exists():
        print(f"DuckDB database not found at {DUCKDB_PATH}")
        sys.exit(1)

    if SQLITE_PATH.exists():
        print(f"SQLite database already exists at {SQLITE_PATH}")
        print("Delete it first if you want to re-run the migration.")
        sys.exit(1)

    print(f"Migrating {DUCKDB_PATH} → {SQLITE_PATH}")

    # Open DuckDB read-only
    duck = duckdb.connect(str(DUCKDB_PATH), read_only=True)

    # Create SQLite database
    lite = sqlite3.connect(str(SQLITE_PATH))
    lite.execute("PRAGMA journal_mode=WAL")
    lite.execute("PRAGMA busy_timeout=5000")

    # Create tables in SQLite
    lite.execute("""
        CREATE TABLE window_events (
            timestamp TEXT NOT NULL,
            app_name TEXT NOT NULL,
            window_title TEXT,
            browser_url TEXT,
            logical_date TEXT NOT NULL,
            PRIMARY KEY (timestamp, app_name)
        )
    """)
    lite.execute("CREATE INDEX idx_window_logical_date ON window_events(logical_date)")

    lite.execute("""
        CREATE TABLE key_events (
            timestamp TEXT NOT NULL PRIMARY KEY,
            key_count INTEGER NOT NULL,
            logical_date TEXT NOT NULL
        )
    """)
    lite.execute("CREATE INDEX idx_key_logical_date ON key_events(logical_date)")

    lite.execute("""
        CREATE TABLE notes (
            timestamp TEXT NOT NULL PRIMARY KEY,
            content TEXT NOT NULL,
            logical_date TEXT NOT NULL
        )
    """)
    lite.execute("CREATE INDEX idx_notes_logical_date ON notes(logical_date)")

    lite.execute("""
        CREATE TABLE daily_blog (
            logical_date TEXT PRIMARY KEY,
            content TEXT
        )
    """)

    lite.execute("""
        CREATE TABLE settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)

    # Migrate each table
    tables = [
        ("window_events", "SELECT timestamp, app_name, window_title, browser_url, logical_date FROM window_events"),
        ("key_events", "SELECT timestamp, key_count, logical_date FROM key_events"),
        ("notes", "SELECT timestamp, content, logical_date FROM notes"),
        ("daily_blog", "SELECT logical_date, content FROM daily_blog"),
        ("settings", "SELECT key, value FROM settings"),
    ]

    for table_name, query in tables:
        rows = duck.execute(query).fetchall()
        if not rows:
            print(f"  {table_name}: 0 rows (empty)")
            continue

        # Convert date/datetime values to ISO strings
        converted = [tuple(to_iso(v) for v in row) for row in rows]
        placeholders = ", ".join(["?"] * len(converted[0]))
        lite.executemany(f"INSERT INTO {table_name} VALUES ({placeholders})", converted)
        print(f"  {table_name}: {len(converted)} rows migrated")

    lite.commit()

    # Verify row counts
    print("\nVerifying row counts...")
    all_match = True
    for table_name, _ in tables:
        duck_count = duck.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
        lite_count = lite.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
        status = "OK" if duck_count == lite_count else "MISMATCH"
        if duck_count != lite_count:
            all_match = False
        print(f"  {table_name}: DuckDB={duck_count}, SQLite={lite_count} [{status}]")

    duck.close()
    lite.close()

    if all_match:
        print("\nMigration complete! All row counts match.")
    else:
        print("\nWARNING: Some row counts don't match. Check the data.")
        sys.exit(1)


if __name__ == "__main__":
    migrate()
