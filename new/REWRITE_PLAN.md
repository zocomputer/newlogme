# ulogme Modern Rewrite Plan

> A complete modernization of [karpathy/ulogme](https://github.com/karpathy/ulogme) for macOS (2024+)

## Executive Summary

The original ulogme was built 11 years ago using Python 2.7, PyObjC, bash scripts, and vanilla JavaScript with D3.js. This rewrite targets modern macOS (Apple Silicon compatible), uses Python 3.13+ for the tracker daemon, and React/TypeScript for visualization. Our new rewrite will live in new/

## Key Technology Choices

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Package Manager** | uv (Python), bun (TypeScript) | Modern, fast tooling |
| **Database** | DuckDB | Embedded analytics DB, excellent for time-series queries |
| **Backend** | Hono on Bun | Fast, minimal TypeScript server |
| **Frontend** | React + Vite + Tailwind | With shadcn/ui components |
| **Charts** | Recharts via shadcn/ui | See `docs/shadcncharts.md` for usage guide |
| **Tracker** | Python + PyObjC (pure) | Native macOS APIs, no pynput wrapper needed |

## Reference Documentation

- **Charting Guide:** [`site-template/docs/shadcncharts.md`](./site-template/docs/shadcncharts.md) — Complete reference for building charts with shadcn/ui and Recharts

---

## 1. Architecture Overview

### Current (Legacy) Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                       Data Collection                        │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ ulogme_osx.py    │  │ bash keyfreq     │                 │
│  │ (PyObjC/Python2) │  │ counter loop     │                 │
│  └────────┬─────────┘  └────────┬─────────┘                 │
│           │                     │                            │
│           ▼                     ▼                            │
│  ┌──────────────────────────────────────────┐               │
│  │  logs/*.txt  (timestamp + data per line) │               │
│  └────────────────────┬─────────────────────┘               │
│                       │                                      │
│           ┌───────────┴───────────┐                         │
│           ▼                       ▼                          │
│  ┌─────────────────┐    ┌─────────────────────┐             │
│  │ export_events.py│───▶│ render/*.json       │             │
│  └─────────────────┘    └──────────┬──────────┘             │
│                                    │                         │
│                                    ▼                         │
│  ┌─────────────────┐    ┌─────────────────────┐             │
│  │ ulogme_serve.py │◀───│ index.html/overview │             │
│  │ (Python2 HTTP)  │    │ (jQuery + D3.js)    │             │
│  └─────────────────┘    └─────────────────────┘             │
└─────────────────────────────────────────────────────────────┘
```

### New Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    Python Daemon (uv)                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  tracker/                                               │ │
│  │  ├── daemon.py        (main entry, launchd-friendly)   │ │
│  │  ├── window.py        (active window via pyobjc)       │ │
│  │  ├── keyboard.py      (key events via Quartz CGEvent)  │ │
│  │  ├── storage.py       (DuckDB for all events)          │ │
│  │  └── config.py        (user preferences)               │ │
│  └────────────────────────┬───────────────────────────────┘ │
│                           │                                  │
│                           ▼                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  data/ulogme.duckdb  (DuckDB)                           │ │
│  │  ├── window_events (timestamp, app_name, window_title) │ │
│  │  ├── key_events    (timestamp, key_count)              │ │
│  │  ├── notes         (timestamp, content)                │ │
│  │  └── daily_blog    (date, content)                     │ │
│  └────────────────────────┬───────────────────────────────┘ │
└───────────────────────────┼─────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│           Hono/Bun Server (site-template/)                   │
│                           │                                  │
│  ┌────────────────────────┴───────────────────────────────┐ │
│  │  server.ts                                              │ │
│  │  └── API Routes (using @duckdb/node-api)                │ │
│  │      GET  /api/events/:date       (day's events)        │ │
│  │      GET  /api/events             (date range list)     │ │
│  │      GET  /api/overview           (aggregated stats)    │ │
│  │      POST /api/notes              (add note)            │ │
│  │      POST /api/blog               (save blog)           │ │
│  │      GET  /api/settings           (user prefs)          │ │
│  │      PUT  /api/settings           (update prefs)        │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                  │
│  ┌────────────────────────┴───────────────────────────────┐ │
│  │  React Frontend (Vite + shadcn/ui + Recharts)           │ │
│  │  ├── pages/                                             │ │
│  │  │   ├── DayView.tsx      (single-day timeline)        │ │
│  │  │   ├── Overview.tsx     (multi-day stacked chart)    │ │
│  │  │   └── Settings.tsx     (configure mappings)         │ │
│  │  └── components/                                        │ │
│  │      ├── TimelineChart.tsx                              │ │
│  │      ├── KeystrokeGraph.tsx                             │ │
│  │      ├── CategoryPieChart.tsx                           │ │
│  │      ├── NotesPanel.tsx                                 │ │
│  │      └── HackingStreak.tsx                              │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Features to Preserve

### 2.1 Data Collection
| Feature | Legacy Implementation | Modern Implementation |
|---------|----------------------|----------------------|
| Active window tracking | PyObjC `NSWorkspace` notifications + AppleScript for Chrome tabs | Same approach with pyobjc-framework-Cocoa + pyobjc-framework-Quartz |
| Keystroke counting | `NSEvent.addGlobalMonitorForEventsMatchingMask_handler_` | Same pure PyObjC approach (proven reliable) |
| Screen lock detection | `NSWorkspaceScreensDidSleepNotification` | Same approach |
| Day boundary at 7am | `rewind7am.py` calculates "logical day" | Same logic in Python module |

### 2.2 Data Visualization
| Feature | Legacy (D3.js) | Modern (Recharts/React) |
|---------|---------------|------------------------|
| Timeline barcode | Custom SVG rects | `<BarChart>` with custom render |
| Keystroke frequency graph | D3 line chart | `<AreaChart>` |
| Pie chart (time distribution) | D3 pie | `<PieChart>` |
| Horizontal bar stats | Custom D3 bars | `<BarChart layout="vertical">` |
| Hacking streak visualization | Custom intensity bars | Custom component with gradient |
| Notes markers | SVG text annotations | Interactive overlay component |

### 2.3 User Interactions
- Click on timeline bar → add note at that time
- Navigate between days (← →)
- Daily blog/memo entry
- Toggle categories on/off in overview
- Click day bar → navigate to day view

---

## 3. Implementation Phases

### Phase 1: Python Tracker Daemon
**Goal:** Reliable background data collection on modern macOS

#### 3.1.1 Project Setup
```bash
cd new/
uv add duckdb pyobjc-framework-Cocoa pyobjc-framework-Quartz
```

> **Note:** We use pure PyObjC (no pynput). The original ulogme proved this approach works reliably, and pynput just wraps the same Quartz APIs anyway. Fewer dependencies = fewer potential issues.

#### 3.1.2 Files to Create
```
new/
├── tracker/
│   ├── __init__.py
│   ├── daemon.py          # Main entry point, signal handling
│   ├── window.py          # Active window monitoring
│   ├── keyboard.py        # Keystroke counting (privacy-respecting)
│   ├── storage.py         # DuckDB operations
│   ├── config.py          # Configuration loading
│   └── utils.py           # Shared utilities (rewind7am, etc.)
├── data/                  # Created at runtime
│   └── ulogme.duckdb
└── ulogme.toml            # User configuration
```

#### 3.1.3 Key Implementation Details

**Window Tracking (`window.py`):**
```python
# Core approach:
# 1. Subscribe to NSWorkspaceDidActivateApplicationNotification
# 2. On activation, get window name via Accessibility API or CGWindowListCopyWindowInfo
# 3. For browsers, get URL/tab title via AppleScript (enabled by default)
# 4. Write to DuckDB only when window changes (debounce rapid switches)
```

**Keystroke Counting (`keyboard.py`):**
```python
# Privacy-first design using pure PyObjC (same as legacy):
# - Only count keystrokes, never log actual keys
# - Use NSEvent.addGlobalMonitorForEventsMatchingMask_handler_ for key events
# - Aggregate counts in 9-second windows (matches legacy)
# - Requires Accessibility permission in System Settings
#
# Example (from legacy code):
#   mask = NSKeyDownMask
#   NSEvent.addGlobalMonitorForEventsMatchingMask_handler_(mask, self.key_handler)
```

**Storage Schema (`storage.py`):**

Using DuckDB for its excellent analytics capabilities and time-series query performance:

```sql
-- DuckDB schema (native TIMESTAMP, aggregations, window functions)

CREATE TABLE window_events (
    timestamp TIMESTAMP NOT NULL,
    app_name VARCHAR NOT NULL,
    window_title VARCHAR,
    browser_url VARCHAR,                  -- Full URL for browsers (opt-in trackable)
    logical_date DATE NOT NULL,           -- 7am-based logical day
    PRIMARY KEY (timestamp, app_name)
);
CREATE INDEX idx_window_logical_date ON window_events(logical_date);

CREATE TABLE key_events (
    timestamp TIMESTAMP NOT NULL PRIMARY KEY,
    key_count INTEGER NOT NULL,
    logical_date DATE NOT NULL
);
CREATE INDEX idx_key_logical_date ON key_events(logical_date);

CREATE TABLE notes (
    timestamp TIMESTAMP NOT NULL PRIMARY KEY,
    content VARCHAR NOT NULL,
    logical_date DATE NOT NULL
);

CREATE TABLE daily_blog (
    logical_date DATE PRIMARY KEY,
    content VARCHAR
);

CREATE TABLE settings (
    key VARCHAR PRIMARY KEY,
    value JSON  -- DuckDB has native JSON support
);
```

**Why DuckDB?**
- Embedded (single file, no server)
- Excellent for analytical queries (aggregations, window functions)
- Native `TIMESTAMP` and `DATE` types with rich date/time functions
- Native JSON support for settings
- Works great with both Python (`duckdb` package) and TypeScript (`@duckdb/node-api`)
- Columnar storage is efficient for time-series data
- Used for ALL data storage in this project (no mixed databases)

#### 3.1.4 Permissions & Setup
- macOS requires **Accessibility** permission for keystroke monitoring
- CLI commands:
  - `uv run python -m tracker start` — start daemon
  - `uv run python -m tracker stop` — stop daemon
  - `uv run python -m tracker status` — check if running
  - `uv run python -m tracker install` — install launchd service
  - `uv run python -m tracker uninstall` — remove launchd service

#### 3.1.5 launchd Integration

Auto-start the tracker as a proper macOS user agent. The `install` command creates:

**`~/Library/LaunchAgents/com.ulogme.tracker.plist`:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ulogme.tracker</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/.local/bin/uv</string>
        <string>run</string>
        <string>--project</string>
        <string>/path/to/ulogme/new</string>
        <string>python</string>
        <string>-m</string>
        <string>tracker</string>
        <string>run</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/ulogme/new</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/path/to/ulogme/new/data/tracker.log</string>
    <key>StandardErrorPath</key>
    <string>/path/to/ulogme/new/data/tracker.error.log</string>
</dict>
</plist>
```

The `install` command will:
1. Generate the plist with correct absolute paths
2. Copy to `~/Library/LaunchAgents/`
3. Load with `launchctl load`

The `uninstall` command will:
1. Unload with `launchctl unload`
2. Remove the plist file

---

### Phase 2: Backend API (Hono/TypeScript)
**Goal:** REST API that reads DuckDB and serves data to frontend

#### 3.2.1 Project Setup
```bash
cd site-template/
bun add @duckdb/node-api
```

#### 3.2.2 Files to Create/Modify
```
site-template/
├── backend-lib/
│   ├── db.ts              # DuckDB connection (replaces bun:sqlite)
│   └── utils.ts           # Date utilities, rewind7am logic
├── server.ts              # Add ulogme API routes
```

> **Note:** All storage uses DuckDB. The existing `bun:sqlite` code will be replaced with DuckDB via `@duckdb/node-api`.

#### 3.2.3 API Endpoints

```typescript
// GET /api/ulogme/dates
// Returns list of available dates
// Response: { dates: [{ logical_date: "2024-12-29", label: "Dec 29, 2024" }, ...] }

// GET /api/ulogme/day/:logical_date
// Returns all events for a single day
// Response: {
//   window_events: [{ timestamp: "2024-12-29T10:00:00", app: "Chrome", title: "GitHub", url: "https://github.com/..." }, ...],
//   key_events: [{ timestamp: "2024-12-29T10:00:09", count: 42 }, ...],
//   notes: [{ timestamp: "2024-12-29T12:00:00", content: "lunch break" }, ...],
//   blog: "Productive day working on..."
// }

// GET /api/ulogme/overview?from=X&to=Y
// Aggregated stats across date range (DuckDB excels at these!)
// Response: {
//   days: [{ logical_date, total_keys, category_durations: {...} }, ...],
//   totals: { total_keys, total_time, by_category: {...} }
// }

// POST /api/ulogme/note
// Body: { timestamp: number, content: string }

// PUT /api/ulogme/blog/:logical_date  
// Body: { content: string }

// GET /api/ulogme/settings
// PUT /api/ulogme/settings
// Body: { title_mappings: [...], display_groups: [...], hacking_titles: [...] }
```

#### 3.2.4 DuckDB from TypeScript
```typescript
import { DuckDBInstance } from "@duckdb/node-api";

// Initialize DuckDB connection
const DB_PATH = "../data/ulogme.duckdb";

// Create instance and connection
const instance = await DuckDBInstance.create(DB_PATH);
const connection = await instance.connect();

// Example: Query day's events with duration calculation using native TIMESTAMP
const result = await connection.run(`
  SELECT 
    app_name,
    COUNT(*) as event_count,
    SUM(LEAD(timestamp) OVER (ORDER BY timestamp) - timestamp) as total_duration
  FROM window_events 
  WHERE logical_date = ?
  GROUP BY app_name
  ORDER BY total_duration DESC
`, [logicalDate]);

// DuckDB's analytical capabilities shine for overview queries:
const overview = await connection.run(`
  SELECT 
    logical_date,
    SUM(key_count) as total_keys,
    COUNT(DISTINCT app_name) as unique_apps
  FROM key_events k
  JOIN window_events w USING (logical_date)
  WHERE logical_date BETWEEN ? AND ?
  GROUP BY logical_date
  ORDER BY logical_date
`, [fromDate, toDate]);

// Date functions work naturally with native TIMESTAMP/DATE types:
const today = await connection.run(`
  SELECT * FROM window_events 
  WHERE logical_date = CURRENT_DATE
  ORDER BY timestamp
`);
```

---

### Phase 3: React Frontend
**Goal:** Beautiful, modern visualization of activity data

> **📚 Chart Reference:** See [`docs/shadcncharts.md`](./site-template/docs/shadcncharts.md) for complete Recharts usage with shadcn/ui

#### 3.3.1 New Pages
```
src/pages/
├── DayView.tsx            # Single-day detailed view
├── Overview.tsx           # Multi-day aggregated view  
└── Settings.tsx           # Configure title mappings
```

#### 3.3.2 New Components
```
src/components/ulogme/
├── ActivityTimeline.tsx   # Main barcode-style timeline
├── KeystrokeChart.tsx     # Area chart of typing activity
├── CategoryPieChart.tsx   # Time distribution pie
├── CategoryStats.tsx      # Horizontal bar chart of categories
├── HackingStreak.tsx      # "Focused work" visualization
├── NotesOverlay.tsx       # Notes markers on timeline
├── DayNavigation.tsx      # ← Day navigation →
├── BlogEntry.tsx          # Daily blog/memo editor
├── OverviewChart.tsx      # Stacked bar chart for overview
└── CategoryLegend.tsx     # Interactive legend (click to toggle)
```

#### 3.3.3 Design System Decisions

**Color Palette (CRITICAL):**
Per `docs/shadcncharts.md`, use CSS variables correctly:
```tsx
// ✅ CORRECT: Use var(--chart-N) directly
const chartConfig = {
  browser: { label: "Browser", color: "var(--chart-1)" },
  coding: { label: "Coding", color: "var(--chart-2)" },
  terminal: { label: "Terminal", color: "var(--chart-3)" },
} satisfies ChartConfig;

// Then in components: var(--color-<dataKey>)
<Bar dataKey="browser" fill="var(--color-browser)" />

// ❌ WRONG: Don't wrap in hsl() - causes invisible charts!
// color: "hsl(var(--chart-1))"  // BROKEN
```

**Timeline Component Spec:**
```tsx
// Each category gets its own row (like legacy "barcode view")
// Hover shows tooltip with window title + duration
// Click opens note dialog for that timestamp
// Time axis shows hours (7am start matches logical day)
```

#### 3.3.4 Chart Components (with shadcn/ui patterns)

**1. KeystrokeChart — Area chart with gradient fill:**
```tsx
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const chartConfig = {
  keystrokes: { label: "Keystrokes", color: "var(--chart-1)" },
} satisfies ChartConfig;

<ChartContainer config={chartConfig} className="h-[150px] w-full">
  <AreaChart data={keyEvents} accessibilityLayer>
    <defs>
      <linearGradient id="fillKeys" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="var(--color-keystrokes)" stopOpacity={0.8} />
        <stop offset="95%" stopColor="var(--color-keystrokes)" stopOpacity={0.1} />
      </linearGradient>
    </defs>
    <CartesianGrid vertical={false} />
    <XAxis dataKey="time" tickFormatter={formatHour} />
    <ChartTooltip content={<ChartTooltipContent />} />
    <Area dataKey="count" fill="url(#fillKeys)" stroke="var(--color-keystrokes)" />
  </AreaChart>
</ChartContainer>
```

**2. CategoryPieChart — Donut with center label:**
```tsx
import { Pie, PieChart, Label } from "recharts";

// Data must include `fill` property for each slice
const pieData = categories.map(cat => ({
  name: cat.name,
  value: cat.duration,
  fill: `var(--color-${cat.key})`,
}));

<PieChart>
  <Pie data={pieData} dataKey="value" innerRadius={60}>
    <Label content={({ viewBox }) => (
      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
        <tspan className="fill-foreground text-2xl font-bold">
          {formatDuration(totalTime)}
        </tspan>
      </text>
    )} />
  </Pie>
</PieChart>
```

**3. CategoryStats — Horizontal bars:**
```tsx
import { Bar, BarChart, XAxis, YAxis } from "recharts";

<BarChart data={categoryStats} layout="vertical">
  <XAxis type="number" hide />
  <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} />
  <ChartTooltip content={<ChartTooltipContent />} />
  <Bar dataKey="duration" radius={4}>
    {categoryStats.map((entry) => (
      <Cell key={entry.name} fill={`var(--color-${entry.key})`} />
    ))}
  </Bar>
</BarChart>
```

**4. OverviewChart — Stacked vertical bars (one per day):**
```tsx
<BarChart data={dailyData} accessibilityLayer>
  <CartesianGrid vertical={false} />
  <XAxis dataKey="date" tickFormatter={formatDate} />
  <ChartTooltip content={<ChartTooltipContent />} />
  <ChartLegend content={<ChartLegendContent />} />
  {categories.map((cat, i) => (
    <Bar key={cat} dataKey={cat} stackId="a" fill={`var(--chart-${(i % 5) + 1})`} />
  ))}
</BarChart>
```

#### 3.3.5 State Management
- React Query (or `useSWR`) for data fetching with caching
- URL-based routing for day navigation (`/day/:date`, `/overview`)
- Local storage for user preferences (synced with backend settings)

---

### Phase 4: Category Mapping System
**Goal:** Flexible, user-configurable window title → category mapping

#### 3.4.1 Legacy Approach (Preserved)
```javascript
// Pattern matching with ordered rules
var title_mappings = [
  {pattern: /Google Chrome/, mapto: 'Browser'},
  {pattern: /\.py.*VS Code/, mapto: 'Coding'},  // Order matters!
  {pattern: /VS Code/, mapto: 'Editor'},
];
```

#### 3.4.2 Modern Implementation
```typescript
// Settings stored in DuckDB (JSON), editable via UI
interface TitleMapping {
  pattern: string;      // Regex pattern
  category: string;     // Target category name
  priority: number;     // Higher = checked first
}

interface CategoryGroup {
  name: string;
  categories: string[]; // Categories to render together
  color?: string;       // Optional override
}

interface UlogmeSettings {
  title_mappings: TitleMapping[];
  display_groups: CategoryGroup[];
  hacking_categories: string[];   // For "focused work" detection
  day_boundary_hour: number;      // Default 7
}
```

#### 3.4.3 Settings UI
- Drag-and-drop reordering of mapping rules
- Live preview of pattern matching
- Preset templates for common apps
- Import/export settings as JSON

---

### Phase 5: Polish & UX

#### 3.5.1 Onboarding Flow
1. Permission check (Accessibility for keystrokes)
2. Initial category mapping wizard
3. Start tracker daemon
4. First data collection confirmation

#### 3.5.2 Real-time Updates
- Polling or WebSocket for live dashboard updates
- Debounced refresh (don't hammer DB)
- "Last synced: X seconds ago" indicator

#### 3.5.3 Performance Considerations
- DuckDB's columnar storage is optimized for analytical queries
- Leverage DuckDB window functions for duration calculations
- Pagination for overview (don't load 365 days at once)
- Virtualized lists for long note histories
- DuckDB handles aggregations efficiently — no need for pre-computed rollups

---

## 4. Implementation Checklist

### Phase 1: Tracker Daemon
- [ ] Set up dependencies via uv (`duckdb`, `pyobjc-framework-Cocoa`, `pyobjc-framework-Quartz`)
- [ ] Implement `utils.py` with rewind7am logic (using native datetime/DATE)
- [ ] Implement `storage.py` with DuckDB schema and queries (TIMESTAMP/DATE types)
- [ ] Implement `window.py` with NSWorkspace monitoring + CGWindowListCopyWindowInfo
- [ ] Implement `keyboard.py` with NSEvent global monitor (pure PyObjC)
- [ ] Implement `daemon.py` with proper signal handling
- [ ] Create `config.py` for loading ulogme.toml
- [ ] Test on modern macOS (Sonoma/Sequoia)
- [ ] Add permission check/request helpers
- [ ] Create CLI for start/stop/status/install/uninstall
- [ ] Implement launchd plist generation and installation

### Phase 2: Backend API
- [ ] Add `@duckdb/node-api` dependency to site-template
- [ ] Replace `bun:sqlite` in `db.ts` with DuckDB connection
- [ ] Implement `/api/ulogme/dates` endpoint
- [ ] Implement `/api/ulogme/day/:date` endpoint
- [ ] Implement `/api/ulogme/overview` endpoint (leverage DuckDB aggregations)
- [ ] Implement note and blog POST endpoints
- [ ] Implement settings GET/PUT endpoints
- [ ] Add category mapping logic (regex eval)

### Phase 3: Frontend - Day View
- [ ] Create `DayView.tsx` page with routing
- [ ] Build `ActivityTimeline.tsx` component
- [ ] Build `KeystrokeChart.tsx` component
- [ ] Build `CategoryPieChart.tsx` component
- [ ] Build `CategoryStats.tsx` component
- [ ] Build `HackingStreak.tsx` component
- [ ] Build `NotesOverlay.tsx` component
- [ ] Build `DayNavigation.tsx` component
- [ ] Build `BlogEntry.tsx` component
- [ ] Wire up data fetching and state

### Phase 4: Frontend - Overview
- [ ] Create `Overview.tsx` page
- [ ] Build `OverviewChart.tsx` (stacked bars)
- [ ] Build `CategoryLegend.tsx` (toggleable)
- [ ] Build summary stats components
- [ ] Add date range picker

### Phase 5: Frontend - Settings
- [ ] Create `Settings.tsx` page
- [ ] Build title mapping editor
- [ ] Build display groups editor
- [ ] Build hacking categories selector
- [ ] Add import/export functionality

### Phase 6: Integration & Polish
- [ ] End-to-end testing
- [ ] Error handling and loading states
- [ ] Responsive design check
- [ ] Dark mode testing
- [ ] Performance optimization
- [ ] Documentation

---

## 5. File Structure (Final)

```
new/
├── pyproject.toml              # Python project config (uv managed)
├── ulogme.toml                 # User configuration
├── REWRITE_PLAN.md             # This file
├── tracker/
│   ├── __init__.py
│   ├── __main__.py             # CLI entry point
│   ├── daemon.py
│   ├── window.py
│   ├── keyboard.py
│   ├── storage.py              # DuckDB operations
│   ├── config.py
│   ├── launchd.py              # launchd plist generation & installation
│   └── utils.py
├── data/
│   ├── ulogme.duckdb           # DuckDB database file
│   ├── tracker.log             # stdout from launchd
│   └── tracker.error.log       # stderr from launchd
└── site-template/
    ├── package.json            # Includes @duckdb/node-api
    ├── server.ts               # Hono server + API
    ├── backend-lib/
    │   ├── db.ts               # DuckDB connection & queries
    │   └── utils.ts
    ├── docs/
    │   └── shadcncharts.md     # Chart implementation guide
    └── src/
        ├── pages/
        │   ├── DayView.tsx
        │   ├── Overview.tsx
        │   └── Settings.tsx
        └── components/
            └── ulogme/
                ├── ActivityTimeline.tsx
                ├── KeystrokeChart.tsx
                ├── CategoryPieChart.tsx
                ├── CategoryStats.tsx
                ├── HackingStreak.tsx
                ├── NotesOverlay.tsx
                ├── DayNavigation.tsx
                ├── BlogEntry.tsx
                ├── OverviewChart.tsx
                └── CategoryLegend.tsx
```

---

## 6. Commands Reference

```bash
# Start the tracker daemon (foreground)
cd new/
uv run python -m tracker start

# Stop the tracker
uv run python -m tracker stop

# Check status
uv run python -m tracker status

# Install as launchd service (auto-start on login)
uv run python -m tracker install

# Uninstall launchd service
uv run python -m tracker uninstall

# Start the web UI (development)
cd new/site-template/
bun run dev

# Build for production
bun run build
bun run prod
```

---

## 7. Privacy & Security Notes

1. **Keystroke counting only** — We never log actual keypress characters
2. **Local storage only** — All data stays on your machine (DuckDB file)
3. **No network calls** — Tracker daemon is fully offline
4. **All tracking enabled by default** — This is a personal tool for your own machine
5. **Accessibility permission** — Required for global key monitoring, user must grant

**Default Configuration (`ulogme.toml`):**
```toml
[tracking]
# All tracking enabled by default — this is your personal data on your local machine
window_titles = true
browser_tabs = true      # Track active tab titles
browser_urls = true      # Track full URLs (useful for categorization)
keystrokes = true

[day_boundary]
hour = 7  # Day starts at 7am (late night sessions count as previous day)
```

---

## 8. Next Steps

1. **Start with Phase 1** — Get the tracker daemon working and collecting data
2. **Then Phase 2** — Build API to serve that data
3. **Then Phase 3** — Build the day view (most important visualization)
4. **Iterate** — Add overview, settings, polish

The tracker is the foundation — without data collection, there's nothing to visualize. Get that solid first, then build up the UI layer by layer.

