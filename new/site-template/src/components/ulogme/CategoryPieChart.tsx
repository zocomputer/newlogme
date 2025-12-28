import React, { useMemo } from "react";
import { Pie, PieChart, Cell, Label } from "recharts";
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

// Chart colors
const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export function CategoryPieChart({ events }: Props) {
  const { pieData, totalSeconds, chartConfig } = useMemo(() => {
    if (events.length === 0) {
      return { pieData: [], totalSeconds: 0, chartConfig: {} as ChartConfig };
    }

    // Calculate durations by app
    const durations: Record<string, number> = {};

    for (let i = 0; i < events.length; i++) {
      const current = new Date(events[i].timestamp);
      const next = events[i + 1]
        ? new Date(events[i + 1].timestamp)
        : current; // Last event has 0 duration

      const durationSecs = (next.getTime() - current.getTime()) / 1000;

      // Cap at 30 minutes to handle gaps
      const cappedDuration = Math.min(durationSecs, 30 * 60);

      const app = events[i].app_name;
      durations[app] = (durations[app] || 0) + cappedDuration;
    }

    // Sort by duration and take top 5
    const sorted = Object.entries(durations)
      .filter(([app]) => app !== "__LOCKEDSCREEN")
      .sort((a, b) => b[1] - a[1]);

    const topApps = sorted.slice(0, 5);
    const otherDuration = sorted
      .slice(5)
      .reduce((sum, [, dur]) => sum + dur, 0);

    if (otherDuration > 0) {
      topApps.push(["Other", otherDuration]);
    }

    const total = topApps.reduce((sum, [, dur]) => sum + dur, 0);

    // Build chart config
    const config: ChartConfig = {
      duration: { label: "Duration" },
    };

    const data = topApps.map(([app, duration], index) => {
      const key = app.toLowerCase().replace(/\s+/g, "_");
      config[key] = {
        label: app,
        color: COLORS[index % COLORS.length],
      };

      return {
        name: app,
        value: duration,
        key,
        fill: `var(--color-${key})`,
      };
    });

    return { pieData: data, totalSeconds: total, chartConfig: config };
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="h-[250px] flex items-center justify-center text-slate-500">
        No activity data
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[250px]">
      <PieChart>
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelKey="name"
              formatter={(value, name) => {
                const secs = Number(value);
                return (
                  <span>
                    {name}: {formatDuration(secs)}
                  </span>
                );
              }}
            />
          }
        />
        <Pie
          data={pieData}
          dataKey="value"
          nameKey="name"
          innerRadius={60}
          outerRadius={90}
          strokeWidth={2}
          stroke="#0f172a"
        >
          {pieData.map((entry, index) => (
            <Cell key={entry.key} fill={COLORS[index % COLORS.length]} />
          ))}
          <Label
            content={({ viewBox }) => {
              if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                return (
                  <text
                    x={viewBox.cx}
                    y={viewBox.cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    <tspan
                      x={viewBox.cx}
                      y={viewBox.cy}
                      className="fill-slate-100 text-2xl font-bold"
                    >
                      {formatDuration(totalSeconds)}
                    </tspan>
                    <tspan
                      x={viewBox.cx}
                      y={(viewBox.cy || 0) + 20}
                      className="fill-slate-400 text-xs"
                    >
                      tracked
                    </tspan>
                  </text>
                );
              }
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

