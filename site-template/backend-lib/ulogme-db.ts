/**
 * DuckDB interface for ulogme data.
 *
 * Provides functions to query the ulogme database created by the Python tracker.
 */

import { DuckDBInstance, DuckDBConnection } from "@duckdb/node-api";
import { join, dirname } from "path";

// Path to the DuckDB database (in the parent new/ directory)
const DB_PATH = join(dirname(dirname(import.meta.dir)), "data", "ulogme.duckdb");

let instance: DuckDBInstance | null = null;
let connection: DuckDBConnection | null = null;

/**
 * Get or create the DuckDB connection.
 * Opens in read-only mode to allow concurrent access with the tracker daemon.
 */
export async function getConnection(): Promise<DuckDBConnection> {
  if (connection !== null) {
    return connection;
  }

  // Open in read-only mode to allow concurrent access with the tracker
  instance = await DuckDBInstance.create(DB_PATH, {
    access_mode: "READ_ONLY",
  });
  connection = await instance.connect();

  return connection;
}

/**
 * Close the database connection.
 */
export async function closeConnection(): Promise<void> {
  if (connection !== null) {
    // DuckDB node-api doesn't have an explicit close method on connection
    connection = null;
  }
  if (instance !== null) {
    instance = null;
  }
}

// Type definitions for ulogme data

export interface WindowEvent {
  timestamp: string;
  app_name: string;
  window_title: string | null;
  browser_url: string | null;
}

export interface KeyEvent {
  timestamp: string;
  key_count: number;
}

export interface Note {
  timestamp: string;
  content: string;
}

export interface DayData {
  logical_date: string;
  window_events: WindowEvent[];
  key_events: KeyEvent[];
  notes: Note[];
  blog: string | null;
}

export interface DateInfo {
  logical_date: string;
  label: string;
}

export interface DailySummary {
  logical_date: string;
  total_keys: number;
  unique_apps: number;
  category_durations?: Record<string, number>;
}

// Query functions

/**
 * Get all available dates that have data.
 */
export async function getAvailableDates(): Promise<DateInfo[]> {
  const conn = await getConnection();

  const result = await conn.run(`
    SELECT DISTINCT logical_date
    FROM (
      SELECT logical_date FROM window_events
      UNION
      SELECT logical_date FROM key_events
    )
    ORDER BY logical_date DESC
  `);

  const rows = await result.getRows();
  const dates: DateInfo[] = [];

  for (const row of rows) {
    const dateValue = row[0];
    if (dateValue) {
      const dateStr =
        typeof dateValue === "string"
          ? dateValue
          : dateValue instanceof Date
            ? dateValue.toISOString().split("T")[0]
            : String(dateValue);

      dates.push({
        logical_date: dateStr,
        label: formatDateLabel(dateStr),
      });
    }
  }

  return dates;
}

/**
 * Format a date string as a human-readable label.
 */
function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Get all data for a specific logical date.
 */
export async function getDayData(logicalDate: string): Promise<DayData> {
  const conn = await getConnection();

  // Get window events
  const windowResult = await conn.run(
    `
    SELECT timestamp, app_name, window_title, browser_url
    FROM window_events
    WHERE logical_date = ?
    ORDER BY timestamp
  `,
    [logicalDate]
  );

  const windowRows = await windowResult.getRows();
  const window_events: WindowEvent[] = windowRows.map((row) => ({
    timestamp: formatTimestamp(row[0]),
    app_name: String(row[1]),
    window_title: row[2] ? String(row[2]) : null,
    browser_url: row[3] ? String(row[3]) : null,
  }));

  // Get key events
  const keyResult = await conn.run(
    `
    SELECT timestamp, key_count
    FROM key_events
    WHERE logical_date = ?
    ORDER BY timestamp
  `,
    [logicalDate]
  );

  const keyRows = await keyResult.getRows();
  const key_events: KeyEvent[] = keyRows.map((row) => ({
    timestamp: formatTimestamp(row[0]),
    key_count: Number(row[1]),
  }));

  // Get notes
  const notesResult = await conn.run(
    `
    SELECT timestamp, content
    FROM notes
    WHERE logical_date = ?
    ORDER BY timestamp
  `,
    [logicalDate]
  );

  const notesRows = await notesResult.getRows();
  const notes: Note[] = notesRows.map((row) => ({
    timestamp: formatTimestamp(row[0]),
    content: String(row[1]),
  }));

  // Get blog
  const blogResult = await conn.run(
    `
    SELECT content
    FROM daily_blog
    WHERE logical_date = ?
  `,
    [logicalDate]
  );

  const blogRows = await blogResult.getRows();
  const blog = blogRows.length > 0 && blogRows[0][0] ? String(blogRows[0][0]) : null;

  return {
    logical_date: logicalDate,
    window_events,
    key_events,
    notes,
    blog,
  };
}

/**
 * Format a timestamp value to ISO string.
 */
function formatTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }
  return String(value);
}

/**
 * Get overview statistics for a date range.
 */
export async function getOverview(
  fromDate?: string,
  toDate?: string,
  limit: number = 30
): Promise<DailySummary[]> {
  const conn = await getConnection();

  let query = `
    SELECT 
      w.logical_date,
      COALESCE(
        (SELECT SUM(key_count) FROM key_events k WHERE k.logical_date = w.logical_date),
        0
      ) as total_keys,
      COUNT(DISTINCT w.app_name) as unique_apps
    FROM window_events w
  `;

  const params: string[] = [];

  if (fromDate || toDate) {
    const conditions: string[] = [];
    if (fromDate) {
      conditions.push("w.logical_date >= ?");
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push("w.logical_date <= ?");
      params.push(toDate);
    }
    query += " WHERE " + conditions.join(" AND ");
  }

  query += `
    GROUP BY w.logical_date
    ORDER BY w.logical_date DESC
    LIMIT ${limit}
  `;

  const result = await conn.run(query, params);
  const rows = await result.getRows();

  return rows.map((row) => ({
    logical_date:
      row[0] instanceof Date
        ? row[0].toISOString().split("T")[0]
        : String(row[0]),
    total_keys: Number(row[1]),
    unique_apps: Number(row[2]),
  }));
}

/**
 * Get app usage breakdown for a date with durations calculated.
 */
export async function getAppUsageForDate(
  logicalDate: string
): Promise<{ app_name: string; duration_seconds: number; event_count: number }[]> {
  const conn = await getConnection();

  // Get events with calculated durations using window functions
  const result = await conn.run(
    `
    WITH event_durations AS (
      SELECT 
        app_name,
        timestamp,
        LEAD(timestamp) OVER (ORDER BY timestamp) as next_timestamp
      FROM window_events
      WHERE logical_date = ?
    )
    SELECT 
      app_name,
      SUM(
        CASE 
          WHEN next_timestamp IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (next_timestamp - timestamp))
          ELSE 0 
        END
      ) as duration_seconds,
      COUNT(*) as event_count
    FROM event_durations
    GROUP BY app_name
    ORDER BY duration_seconds DESC
  `,
    [logicalDate]
  );

  const rows = await result.getRows();

  return rows.map((row) => ({
    app_name: String(row[0]),
    duration_seconds: Number(row[1]),
    event_count: Number(row[2]),
  }));
}

/**
 * Add a note at a specific timestamp.
 */
export async function addNote(
  timestamp: string,
  content: string,
  logicalDate: string
): Promise<void> {
  const conn = await getConnection();

  await conn.run(
    `
    INSERT INTO notes (timestamp, content, logical_date)
    VALUES (?::TIMESTAMP, ?, ?::DATE)
    ON CONFLICT (timestamp) DO UPDATE SET content = excluded.content
  `,
    [timestamp, content, logicalDate]
  );
}

/**
 * Save or update the daily blog.
 */
export async function saveBlog(
  logicalDate: string,
  content: string
): Promise<void> {
  const conn = await getConnection();

  await conn.run(
    `
    INSERT INTO daily_blog (logical_date, content)
    VALUES (?::DATE, ?)
    ON CONFLICT (logical_date) DO UPDATE SET content = excluded.content
  `,
    [logicalDate, content]
  );
}

/**
 * Get settings from the database.
 */
export async function getSettings(): Promise<Record<string, unknown>> {
  const conn = await getConnection();

  const result = await conn.run(`
    SELECT key, value FROM settings
  `);

  const rows = await result.getRows();
  const settings: Record<string, unknown> = {};

  for (const row of rows) {
    const key = String(row[0]);
    try {
      settings[key] = JSON.parse(String(row[1]));
    } catch {
      settings[key] = row[1];
    }
  }

  return settings;
}

/**
 * Update a setting.
 */
export async function updateSetting(
  key: string,
  value: unknown
): Promise<void> {
  const conn = await getConnection();

  await conn.run(
    `
    INSERT INTO settings (key, value)
    VALUES (?, ?::JSON)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `,
    [key, JSON.stringify(value)]
  );
}

