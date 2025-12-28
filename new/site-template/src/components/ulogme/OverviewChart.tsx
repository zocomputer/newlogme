import React, { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

interface DailySummary {
  logical_date: string;
  total_keys: number;
  unique_apps: number;
}

interface Props {
  days: DailySummary[];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function OverviewChart({ days }: Props) {
  const chartData = useMemo(() => {
    // Reverse to show chronological order (oldest to newest)
    return [...days].reverse().map((day) => ({
      date: day.logical_date,
      dateLabel: formatDate(day.logical_date),
      keystrokes: day.total_keys,
      apps: day.unique_apps,
    }));
  }, [days]);

  const chartConfig = {
    keystrokes: {
      label: "Keystrokes",
      color: "var(--chart-1)",
    },
    apps: {
      label: "Unique Apps",
      color: "var(--chart-2)",
    },
  } satisfies ChartConfig;

  if (days.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-slate-500">
        No data available
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <BarChart data={chartData} accessibilityLayer>
        <CartesianGrid
          vertical={false}
          strokeDasharray="3 3"
          stroke="#334155"
        />
        <XAxis
          dataKey="dateLabel"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#64748b", fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#64748b", fontSize: 12 }}
          width={50}
          tickFormatter={(value) => {
            if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
            return value.toString();
          }}
        />
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const data = payload[0].payload;
            return (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
                <p className="text-slate-100 font-medium">{data.dateLabel}</p>
                <p className="text-cyan-400">
                  {data.keystrokes.toLocaleString()} keystrokes
                </p>
                <p className="text-blue-400">{data.apps} apps</p>
              </div>
            );
          }}
        />
        <Bar
          dataKey="keystrokes"
          fill="var(--color-keystrokes)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}

