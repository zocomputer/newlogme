import React, { useMemo } from "react";
import { Bar, BarChart, XAxis, YAxis, Cell } from "recharts";
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

export function CategoryStats({ events }: Props) {
  const { data, chartConfig } = useMemo(() => {
    if (events.length === 0) {
      return { data: [], chartConfig: {} as ChartConfig };
    }

    // Calculate durations by app
    const durations: Record<string, number> = {};

    for (let i = 0; i < events.length; i++) {
      const current = new Date(events[i].timestamp);
      const next = events[i + 1]
        ? new Date(events[i + 1].timestamp)
        : current;

      const durationSecs = (next.getTime() - current.getTime()) / 1000;
      const cappedDuration = Math.min(durationSecs, 30 * 60);

      const app = events[i].app_name;
      durations[app] = (durations[app] || 0) + cappedDuration;
    }

    // Sort by duration
    const sorted = Object.entries(durations)
      .filter(([app]) => app !== "__LOCKEDSCREEN")
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const config: ChartConfig = {
      duration: { label: "Duration" },
    };

    const chartData = sorted.map(([app, duration], index) => {
      const key = app.toLowerCase().replace(/\s+/g, "_");
      config[key] = {
        label: app,
        color: COLORS[index % COLORS.length],
      };

      return {
        name: app,
        duration,
        key,
        durationLabel: formatDuration(duration),
        fill: COLORS[index % COLORS.length],
      };
    });

    return { data: chartData, chartConfig: config };
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-slate-500">
        No activity data
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <BarChart
        data={data}
        layout="vertical"
        accessibilityLayer
        margin={{ left: 10, right: 60 }}
      >
        <XAxis type="number" hide />
        <YAxis
          dataKey="name"
          type="category"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          width={120}
          tickFormatter={(value) =>
            value.length > 15 ? value.slice(0, 15) + "…" : value
          }
        />
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const data = payload[0].payload;
            return (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
                <p className="text-slate-100 font-medium">{data.name}</p>
                <p className="text-cyan-400">{data.durationLabel}</p>
              </div>
            );
          }}
        />
        <Bar dataKey="duration" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell key={entry.key} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

