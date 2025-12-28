import { serveStatic } from "hono/bun";
import type { ViteDevServer } from "vite";
import { createServer as createViteServer } from "vite";
import config from "./zosite.json";
import { Hono } from "hono";
import { getRecentRegistrations, createRegistration } from "./backend-lib/db";
import {
  getAvailableDates,
  getDayData,
  getOverview,
  getAppUsageForDate,
  addNote,
  saveBlog,
  getSettings,
  updateSetting,
} from "./backend-lib/ulogme-db";

type Mode = "development" | "production";
const app = new Hono();

const mode: Mode =
  process.env.NODE_ENV === "production" ? "production" : "development";

/**
 * Add any API routes here.
 */
app.get("/api/hello-zo", (c) => c.json({ msg: "Hello from Zo" }));

// Event registration endpoints (namespaced under _zo to avoid conflicts)
app.get("/api/_zo/demo/registrations", (c) => {
  const registrations = getRecentRegistrations();
  return c.json(registrations);
});

app.post("/api/_zo/demo/register", async (c) => {
  const body = await c.req.json();
  const { name, email, company, notes } = body;

  if (!name || !email) {
    return c.json({ error: "Name and email are required" }, 400);
  }

  const registration = createRegistration(name, email, company, notes);
  return c.json(registration, 201);
});

// ============================================================================
// ulogme API Routes
// ============================================================================

/**
 * GET /api/ulogme/dates
 * Returns list of available dates with data
 */
app.get("/api/ulogme/dates", async (c) => {
  try {
    const dates = await getAvailableDates();
    return c.json({ dates });
  } catch (error) {
    console.error("Error fetching dates:", error);
    return c.json({ error: "Failed to fetch dates", dates: [] }, 500);
  }
});

/**
 * GET /api/ulogme/day/:logicalDate
 * Returns all data for a specific logical date
 */
app.get("/api/ulogme/day/:logicalDate", async (c) => {
  try {
    const logicalDate = c.req.param("logicalDate");
    const data = await getDayData(logicalDate);
    return c.json(data);
  } catch (error) {
    console.error("Error fetching day data:", error);
    return c.json({ error: "Failed to fetch day data" }, 500);
  }
});

/**
 * GET /api/ulogme/day/:logicalDate/apps
 * Returns app usage breakdown with durations for a date
 */
app.get("/api/ulogme/day/:logicalDate/apps", async (c) => {
  try {
    const logicalDate = c.req.param("logicalDate");
    const apps = await getAppUsageForDate(logicalDate);
    return c.json({ apps });
  } catch (error) {
    console.error("Error fetching app usage:", error);
    return c.json({ error: "Failed to fetch app usage" }, 500);
  }
});

/**
 * GET /api/ulogme/overview
 * Returns aggregated stats across a date range
 */
app.get("/api/ulogme/overview", async (c) => {
  try {
    const from = c.req.query("from");
    const to = c.req.query("to");
    const limit = parseInt(c.req.query("limit") || "30", 10);

    const days = await getOverview(from, to, limit);
    return c.json({ days });
  } catch (error) {
    console.error("Error fetching overview:", error);
    return c.json({ error: "Failed to fetch overview" }, 500);
  }
});

/**
 * POST /api/ulogme/note
 * Add a note at a specific timestamp
 */
app.post("/api/ulogme/note", async (c) => {
  try {
    const body = await c.req.json();
    const { timestamp, content, logical_date } = body;

    if (!timestamp || !content || !logical_date) {
      return c.json(
        { error: "timestamp, content, and logical_date are required" },
        400
      );
    }

    await addNote(timestamp, content, logical_date);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error adding note:", error);
    return c.json({ error: "Failed to add note" }, 500);
  }
});

/**
 * PUT /api/ulogme/blog/:logicalDate
 * Save or update the daily blog
 */
app.put("/api/ulogme/blog/:logicalDate", async (c) => {
  try {
    const logicalDate = c.req.param("logicalDate");
    const body = await c.req.json();
    const { content } = body;

    if (content === undefined) {
      return c.json({ error: "content is required" }, 400);
    }

    await saveBlog(logicalDate, content);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error saving blog:", error);
    return c.json({ error: "Failed to save blog" }, 500);
  }
});

/**
 * GET /api/ulogme/settings
 * Get all settings
 */
app.get("/api/ulogme/settings", async (c) => {
  try {
    const settings = await getSettings();
    return c.json(settings);
  } catch (error) {
    console.error("Error fetching settings:", error);
    return c.json({ error: "Failed to fetch settings" }, 500);
  }
});

/**
 * PUT /api/ulogme/settings
 * Update settings
 */
app.put("/api/ulogme/settings", async (c) => {
  try {
    const body = await c.req.json();

    for (const [key, value] of Object.entries(body)) {
      await updateSetting(key, value);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error updating settings:", error);
    return c.json({ error: "Failed to update settings" }, 500);
  }
});

// ============================================================================
// Static file serving and SPA routing
// ============================================================================

if (mode === "production") {
  configureProduction(app);
} else {
  await configureDevelopment(app);
}

/**
 * Determine port based on mode. In production, use the published_port if available.
 * In development, always use the local_port.
 * DO NOT edit this port manually. Ports are managed by the system via the zosite.json config.
 */
const port =
  mode === "production"
    ? (config.publish?.published_port ?? config.local_port)
    : config.local_port;

export default { fetch: app.fetch, port, idleTimeout: 255 };

/**
 * Configure routing for production builds.
 *
 * - Streams prebuilt assets from `dist`.
 * - Falls back to `index.html` for any other GET so the SPA router can resolve the request.
 */
function configureProduction(app: Hono) {
  app.use("/assets/*", serveStatic({ root: "./dist" }));
  app.use("/favicon.svg", serveStatic({ path: "./favicon.svg" }));
  app.get("/favicon.ico", (c) => c.redirect("/favicon.svg", 302));
  app.use(async (c, next) => {
    if (c.req.method !== "GET") {
      return next();
    }

    const path = c.req.path;
    if (path.startsWith("/api/") || path.startsWith("/assets/")) {
      return next();
    }

    return serveStatic({ path: "./dist/index.html" })(c, next);
  });
}

/**
 * Configure routing for development builds.
 *
 * - Boots Vite in middleware mode for transforms.
 * - Mirrors production routing semantics so SPA routes behave consistently.
 */
async function configureDevelopment(app: Hono): Promise<ViteDevServer> {
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
  });

  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/api/")) {
      return next();
    }

    if (c.req.path === "/favicon.ico") {
      return c.redirect("/favicon.svg", 302);
    }

    if (c.req.path === "/favicon.svg") {
      const file = Bun.file("./favicon.svg");
      if (await file.exists()) {
        return new Response(file);
      }
    }

    const url = c.req.path;
    try {
      if (url === "/" || url === "/index.html") {
        let template = await Bun.file("./index.html").text();
        template = await vite.transformIndexHtml(url, template);
        return c.html(template);
      }

      let result;
      try {
        result = await vite.transformRequest(url);
      } catch {
        result = null;
      }

      if (result) {
        return new Response(result.code, {
          headers: {
            "Content-Type": "application/javascript",
            "Cache-Control": "no-cache",
          },
        });
      }
      const file = Bun.file(`.${url}`);
      if (await file.exists()) {
        return new Response(file, {
          headers: { "Cache-Control": "no-cache" },
        });
      }
      let template = await Bun.file("./index.html").text();
      template = await vite.transformIndexHtml("/", template);
      return c.html(template);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      console.error(error);
      return c.text("Internal Server Error", 500);
    }
  });

  return vite;
}
