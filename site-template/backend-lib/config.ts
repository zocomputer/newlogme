/**
 * Configuration loading for ulogme.
 * Reads and parses ulogme.toml to get category mappings and other settings.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import TOML from "@iarna/toml";

// Path to config file (in parent directory)
const CONFIG_PATH = join(dirname(dirname(import.meta.dir)), "ulogme.toml");

export interface CategoryRule {
  pattern: string;
  regex: RegExp;
  category: string;
}

export interface UlogmeConfig {
  tracking: {
    window_titles: boolean;
    browser_tabs: boolean;
    browser_urls: boolean;
    keystrokes: boolean;
    window_poll_interval: number;
    keystroke_window: number;
  };
  day_boundary: {
    hour: number;
  };
  database: {
    path: string;
  };
  category_rules: CategoryRule[];
  hacking_categories: string[];
}

let cachedConfig: UlogmeConfig | null = null;
let configLastModified: number = 0;

/**
 * Load and parse the ulogme.toml configuration.
 * Caches the result and reloads if the file has changed.
 */
export function loadConfig(): UlogmeConfig {
  if (!existsSync(CONFIG_PATH)) {
    console.warn(`Config file not found: ${CONFIG_PATH}`);
    return getDefaultConfig();
  }

  try {
    const stats = Bun.file(CONFIG_PATH);
    const mtime = stats.lastModified;

    // Return cached config if file hasn't changed
    if (cachedConfig && mtime === configLastModified) {
      return cachedConfig;
    }

    const content = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = TOML.parse(content) as any;

    // Parse category rules
    const categoryRules: CategoryRule[] = [];
    const mappings = parsed.category_mappings?.rules || [];

    for (const rule of mappings) {
      if (rule.pattern && rule.category) {
        try {
          categoryRules.push({
            pattern: rule.pattern,
            regex: new RegExp(rule.pattern, "i"),
            category: rule.category,
          });
        } catch (e) {
          console.warn(`Invalid regex pattern: ${rule.pattern}`);
        }
      }
    }

    cachedConfig = {
      tracking: {
        window_titles: parsed.tracking?.window_titles ?? true,
        browser_tabs: parsed.tracking?.browser_tabs ?? true,
        browser_urls: parsed.tracking?.browser_urls ?? true,
        keystrokes: parsed.tracking?.keystrokes ?? true,
        window_poll_interval: parsed.tracking?.window_poll_interval ?? 2,
        keystroke_window: parsed.tracking?.keystroke_window ?? 9,
      },
      day_boundary: {
        hour: parsed.day_boundary?.hour ?? 7,
      },
      database: {
        path: parsed.database?.path ?? "data/ulogme.duckdb",
      },
      category_rules: categoryRules,
      hacking_categories: parsed.hacking?.categories ?? ["Coding", "Terminal"],
    };

    configLastModified = mtime;
    return cachedConfig;
  } catch (e) {
    console.error(`Error loading config: ${e}`);
    return getDefaultConfig();
  }
}

function getDefaultConfig(): UlogmeConfig {
  return {
    tracking: {
      window_titles: true,
      browser_tabs: true,
      browser_urls: true,
      keystrokes: true,
      window_poll_interval: 2,
      keystroke_window: 9,
    },
    day_boundary: {
      hour: 7,
    },
    database: {
      path: "data/ulogme.duckdb",
    },
    category_rules: [],
    hacking_categories: ["Coding", "Terminal"],
  };
}

/**
 * Categorize a window event based on app name and window title.
 * Returns the first matching category, or "Other" if no match.
 */
export function categorizeWindow(
  appName: string,
  windowTitle: string | null
): string {
  const config = loadConfig();
  
  // Build the full text to match against
  const fullText = windowTitle 
    ? `${appName} :: ${windowTitle}` 
    : appName;

  for (const rule of config.category_rules) {
    if (rule.regex.test(fullText)) {
      return rule.category;
    }
  }

  return "Other";
}

/**
 * Get category color for consistent visualization.
 */
const CATEGORY_COLORS: Record<string, string> = {
  "AI": "#8b5cf6",        // violet
  "AI Infra": "#7c3aed",  // violet-600
  "Coding": "#22c55e",    // green
  "Terminal": "#14b8a6",  // teal
  "Dev": "#06b6d4",       // cyan
  "Email": "#f59e0b",     // amber
  "Calendar": "#3b82f6",  // blue
  "Documents": "#6366f1", // indigo
  "Notes": "#a855f7",     // purple
  "Chat": "#ec4899",      // pink
  "Meetings": "#ef4444",  // red
  "Social": "#f97316",    // orange
  "Video": "#dc2626",     // red-600
  "Music": "#16a34a",     // green-600
  "Browser": "#64748b",   // slate
  "Design": "#d946ef",    // fuchsia
  "Reading": "#0ea5e9",   // sky
  "Shopping": "#eab308",  // yellow
  "Tech News": "#84cc16", // lime
  "Files": "#78716c",     // stone
  "Zo": "#2563eb",        // blue-600 (your product!)
  "Finance": "#059669",   // emerald-600
  "Observability": "#0891b2", // cyan-600
  "Support": "#db2777",   // pink-600
  "Search": "#9333ea",    // purple-600
  "Travel": "#ea580c",    // orange-600
  "Weather": "#38bdf8",   // sky-400
  "Other": "#94a3b8",     // slate-400
};

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS["Other"];
}

/**
 * Get all category colors for chart configuration.
 */
export function getAllCategoryColors(): Record<string, string> {
  return { ...CATEGORY_COLORS };
}

