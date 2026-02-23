/**
 * SQLite interface for ulogme data.
 *
 * Provides functions to query the ulogme database created by the Python tracker.
 */

import { Database } from "bun:sqlite";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { categorizeWindow, getCategoryColor } from "./config";

// Path to the SQLite database (in the parent directory)
const DB_PATH = join(dirname(dirname(import.meta.dir)), "data", "ulogme.db");

function getDb(): Database {
  if (!existsSync(DB_PATH)) {
    throw new Error(`Database not found: ${DB_PATH}. Run the tracker first to create it.`);
  }
  const db = new Database(DB_PATH);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA busy_timeout=5000");
  return db;
}

// Persistent connection (matches pattern in db.ts)
let db: Database;
try {
  db = getDb();
} catch {
  // Database may not exist yet — will be created by the tracker.
  // Defer the error to when a query is actually made.
  db = null as unknown as Database;
}

function ensureDb(): Database {
  if (!db) {
    db = getDb();
  }
  return db;
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
export function getAvailableDates(): DateInfo[] {
  const rows = ensureDb()
    .query<{ logical_date: string }, []>(`
      SELECT DISTINCT logical_date
      FROM (
        SELECT logical_date FROM window_events
        UNION
        SELECT logical_date FROM key_events
      )
      ORDER BY logical_date DESC
    `)
    .all();

  return rows.map((row) => ({
    logical_date: row.logical_date,
    label: formatDateLabel(row.logical_date),
  }));
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
export function getDayData(logicalDate: string): DayData {
  const d = ensureDb();

  // Get window events
  const window_events = d
    .query<{ timestamp: string; app_name: string; window_title: string | null; browser_url: string | null }, [string]>(`
      SELECT timestamp, app_name, window_title, browser_url
      FROM window_events
      WHERE logical_date = ?
      ORDER BY timestamp
    `)
    .all(logicalDate);

  // Get key events
  const key_events = d
    .query<{ timestamp: string; key_count: number }, [string]>(`
      SELECT timestamp, key_count
      FROM key_events
      WHERE logical_date = ?
      ORDER BY timestamp
    `)
    .all(logicalDate);

  // Get notes
  const notes = d
    .query<{ timestamp: string; content: string }, [string]>(`
      SELECT timestamp, content
      FROM notes
      WHERE logical_date = ?
      ORDER BY timestamp
    `)
    .all(logicalDate);

  // Get blog
  const blogRow = d
    .query<{ content: string | null }, [string]>(`
      SELECT content
      FROM daily_blog
      WHERE logical_date = ?
    `)
    .get(logicalDate);

  const blog = blogRow?.content ?? null;

  return {
    logical_date: logicalDate,
    window_events,
    key_events,
    notes,
    blog,
  };
}

/**
 * Get overview statistics for a date range.
 */
export function getOverview(
  fromDate?: string,
  toDate?: string,
  limit: number = 30
): DailySummary[] {
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

  const rows = ensureDb()
    .query<{ logical_date: string; total_keys: number; unique_apps: number }, string[]>(query)
    .all(...params);

  return rows.map((row) => ({
    logical_date: row.logical_date,
    total_keys: Number(row.total_keys),
    unique_apps: Number(row.unique_apps),
  }));
}

/**
 * Get app usage breakdown for a date with durations calculated.
 */
export function getAppUsageForDate(
  logicalDate: string
): { app_name: string; duration_seconds: number; event_count: number }[] {
  const rows = ensureDb()
    .query<{ app_name: string; duration_seconds: number; event_count: number }, [string]>(`
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
            THEN (unixepoch(next_timestamp) - unixepoch(timestamp))
            ELSE 0
          END
        ) as duration_seconds,
        COUNT(*) as event_count
      FROM event_durations
      GROUP BY app_name
      ORDER BY duration_seconds DESC
    `)
    .all(logicalDate);

  return rows.map((row) => ({
    app_name: row.app_name,
    duration_seconds: Number(row.duration_seconds),
    event_count: Number(row.event_count),
  }));
}

export interface CategoryBreakdown {
  category: string;
  duration_seconds: number;
  event_count: number;
  color: string;
  apps: string[];
}

/**
 * Get category breakdown for a date with durations calculated.
 * Applies category rules from the config to group events.
 */
export function getCategoryBreakdownForDate(
  logicalDate: string
): CategoryBreakdown[] {
  const rows = ensureDb()
    .query<{ app_name: string; window_title: string | null; duration_seconds: number; event_count: number }, [string]>(`
      WITH event_durations AS (
        SELECT
          app_name,
          window_title,
          timestamp,
          LEAD(timestamp) OVER (ORDER BY timestamp) as next_timestamp
        FROM window_events
        WHERE logical_date = ?
      )
      SELECT
        app_name,
        window_title,
        SUM(
          CASE
            WHEN next_timestamp IS NOT NULL
            THEN (unixepoch(next_timestamp) - unixepoch(timestamp))
            ELSE 0
          END
        ) as duration_seconds,
        COUNT(*) as event_count
      FROM event_durations
      GROUP BY app_name, window_title
      ORDER BY duration_seconds DESC
    `)
    .all(logicalDate);

  // Group by category
  const categoryMap: Map<string, { duration: number; count: number; apps: Set<string> }> = new Map();

  for (const row of rows) {
    const appName = row.app_name;
    const windowTitle = row.window_title;
    const duration = Number(row.duration_seconds);
    const count = Number(row.event_count);

    // Skip locked screen
    if (appName === "__LOCKEDSCREEN") continue;

    const category = categorizeWindow(appName, windowTitle);

    if (!categoryMap.has(category)) {
      categoryMap.set(category, { duration: 0, count: 0, apps: new Set() });
    }

    const cat = categoryMap.get(category)!;
    cat.duration += duration;
    cat.count += count;
    cat.apps.add(appName);
  }

  // Convert to array and sort by duration
  const categories: CategoryBreakdown[] = [];
  for (const [category, data] of categoryMap) {
    categories.push({
      category,
      duration_seconds: data.duration,
      event_count: data.count,
      color: getCategoryColor(category),
      apps: Array.from(data.apps),
    });
  }

  categories.sort((a, b) => b.duration_seconds - a.duration_seconds);
  return categories;
}

/**
 * Add a note at a specific timestamp.
 */
export function addNote(
  timestamp: string,
  content: string,
  logicalDate: string
): void {
  ensureDb().run(
    `
    INSERT INTO notes (timestamp, content, logical_date)
    VALUES (?, ?, ?)
    ON CONFLICT (timestamp) DO UPDATE SET content = excluded.content
  `,
    [timestamp, content, logicalDate]
  );
}

/**
 * Save or update the daily blog.
 */
export function saveBlog(
  logicalDate: string,
  content: string
): void {
  ensureDb().run(
    `
    INSERT INTO daily_blog (logical_date, content)
    VALUES (?, ?)
    ON CONFLICT (logical_date) DO UPDATE SET content = excluded.content
  `,
    [logicalDate, content]
  );
}

/**
 * Get settings from the database.
 */
export function getSettings(): Record<string, unknown> {
  const rows = ensureDb()
    .query<{ key: string; value: string }, []>(`
      SELECT key, value FROM settings
    `)
    .all();

  const settings: Record<string, unknown> = {};

  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  return settings;
}

/**
 * Update a setting.
 */
export function updateSetting(
  key: string,
  value: unknown
): void {
  ensureDb().run(
    `
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `,
    [key, JSON.stringify(value)]
  );
}
