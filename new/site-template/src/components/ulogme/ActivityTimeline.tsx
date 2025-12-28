import React, { useMemo } from "react";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

interface WindowEvent {
  timestamp: string;
  app_name: string;
  window_title: string | null;
  browser_url: string | null;
}

interface Props {
  events: WindowEvent[];
}

// Color palette for apps
const APP_COLORS: Record<string, string> = {
  "Google Chrome": "var(--chart-1)",
  Safari: "var(--chart-1)",
  Arc: "var(--chart-1)",
  Firefox: "var(--chart-1)",
  Brave: "var(--chart-1)",
  "Visual Studio Code": "var(--chart-2)",
  Cursor: "var(--chart-2)",
  Zed: "var(--chart-2)",
  Terminal: "var(--chart-3)",
  iTerm2: "var(--chart-3)",
  Warp: "var(--chart-3)",
  Slack: "var(--chart-4)",
  Discord: "var(--chart-4)",
  Messages: "var(--chart-4)",
  Finder: "var(--chart-5)",
  __LOCKEDSCREEN: "#374151",
};

function getAppColor(appName: string): string {
  return APP_COLORS[appName] || "var(--chart-5)";
}

function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

export function ActivityTimeline({ events }: Props) {
  const timelineData = useMemo(() => {
    if (events.length === 0) return [];

    // Group events by hour for a simple visualization
    const hourlyData: Record<number, { apps: Map<string, number>; total: number }> = {};

    // Initialize all hours from 7am to 2am next day
    for (let h = 7; h <= 23; h++) {
      hourlyData[h] = { apps: new Map(), total: 0 };
    }
    for (let h = 0; h <= 6; h++) {
      hourlyData[h] = { apps: new Map(), total: 0 };
    }

    // Count events per hour per app
    events.forEach((event, index) => {
      const date = new Date(event.timestamp);
      const hour = date.getHours();

      if (hourlyData[hour]) {
        const current = hourlyData[hour].apps.get(event.app_name) || 0;
        hourlyData[hour].apps.set(event.app_name, current + 1);
        hourlyData[hour].total += 1;
      }
    });

    // Convert to chart data format, ordered by logical day (7am start)
    const orderedHours = [...Array.from({ length: 17 }, (_, i) => i + 7).filter(h => h <= 23),
                         ...Array.from({ length: 7 }, (_, i) => i)];

    return orderedHours.map((hour) => {
      const data = hourlyData[hour];
      const topApp = data.apps.size > 0 
        ? [...data.apps.entries()].sort((a, b) => b[1] - a[1])[0][0]
        : null;

      return {
        hour,
        hourLabel: formatHour(hour),
        events: data.total,
        topApp,
        fill: topApp ? getAppColor(topApp) : "#1f2937",
      };
    }).filter(d => d.events > 0 || d.hour >= 7 && d.hour <= 23);
  }, [events]);

  const chartConfig = {
    events: {
      label: "Events",
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig;

  if (events.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-slate-500">
        No activity data for this day
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-[200px] w-full">
      <BarChart data={timelineData} accessibilityLayer>
        <XAxis
          dataKey="hourLabel"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#64748b", fontSize: 12 }}
          interval={2}
        />
        <YAxis hide />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const data = payload[0].payload;
            return (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
                <p className="text-slate-100 font-medium">{data.hourLabel}</p>
                <p className="text-slate-400 text-sm">{data.events} events</p>
                {data.topApp && (
                  <p className="text-cyan-400 text-sm mt-1">Top: {data.topApp}</p>
                )}
              </div>
            );
          }}
        />
        <Bar dataKey="events" radius={[4, 4, 0, 0]}>
          {timelineData.map((entry, index) => (
            <Cell key={index} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

