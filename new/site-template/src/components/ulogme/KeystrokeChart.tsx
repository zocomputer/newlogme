import React, { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

interface KeyEvent {
  timestamp: string;
  key_count: number;
}

interface Props {
  events: KeyEvent[];
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function KeystrokeChart({ events }: Props) {
  const chartData = useMemo(() => {
    if (events.length === 0) return [];

    return events.map((event) => {
      const date = new Date(event.timestamp);
      return {
        time: formatTime(date),
        timestamp: date.getTime(),
        count: event.key_count,
      };
    });
  }, [events]);

  const chartConfig = {
    count: {
      label: "Keystrokes",
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig;

  if (events.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-slate-500">
        No keystroke data for this day
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-[200px] w-full">
      <AreaChart data={chartData} accessibilityLayer>
        <defs>
          <linearGradient id="fillKeystrokes" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.6} />
            <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid
          vertical={false}
          strokeDasharray="3 3"
          stroke="#334155"
        />
        <XAxis
          dataKey="time"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#64748b", fontSize: 12 }}
          tickFormatter={(value, index) => {
            // Only show every 10th label to avoid crowding
            if (index % 10 === 0) return value;
            return "";
          }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#64748b", fontSize: 12 }}
          width={40}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) => `Time: ${value}`}
            />
          }
        />
        <Area
          dataKey="count"
          type="monotone"
          fill="url(#fillKeystrokes)"
          stroke="var(--color-count)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}

