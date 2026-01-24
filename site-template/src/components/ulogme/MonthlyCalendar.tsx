import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DailySummary {
  logical_date: string;
  total_keys: number;
  unique_apps: number;
}

interface Props {
  days: DailySummary[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getIntensityColor(intensity: number): string {
  if (intensity === 0) return "bg-slate-800/30";
  if (intensity < 0.2) return "bg-cyan-950/80";
  if (intensity < 0.4) return "bg-cyan-900/80";
  if (intensity < 0.6) return "bg-cyan-700/80";
  if (intensity < 0.8) return "bg-cyan-500/80";
  return "bg-cyan-400";
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();

  const days: (number | null)[] = [];

  // Add empty cells for days before the first of the month
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null);
  }

  // Add the days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day);
  }

  return days;
}

export function MonthlyCalendar({ days }: Props) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  // Build a map of date -> summary for quick lookup
  const dayMap = useMemo(() => {
    const map = new Map<string, DailySummary>();
    for (const day of days) {
      map.set(day.logical_date, day);
    }
    return map;
  }, [days]);

  // Calculate max keys for intensity normalization (across all data)
  const maxKeys = useMemo(() => {
    return Math.max(...days.map((d) => d.total_keys), 1);
  }, [days]);

  // Get available date range
  const { minDate, maxDate } = useMemo(() => {
    if (days.length === 0) {
      return { minDate: null, maxDate: null };
    }
    const sorted = [...days].sort((a, b) =>
      a.logical_date.localeCompare(b.logical_date)
    );
    return {
      minDate: new Date(sorted[0].logical_date + "T12:00:00"),
      maxDate: new Date(sorted[sorted.length - 1].logical_date + "T12:00:00"),
    };
  }, [days]);

  const calendarDays = getCalendarDays(currentYear, currentMonth);

  const goToPreviousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const goToToday = () => {
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  };

  // Check if we can navigate further
  const canGoBack = minDate
    ? currentYear > minDate.getFullYear() ||
      (currentYear === minDate.getFullYear() &&
        currentMonth > minDate.getMonth())
    : false;

  const canGoForward =
    currentYear < today.getFullYear() ||
    (currentYear === today.getFullYear() && currentMonth < today.getMonth());

  const isCurrentMonth =
    currentMonth === today.getMonth() && currentYear === today.getFullYear();

  if (days.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-slate-500">
        No data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={goToPreviousMonth}
            disabled={!canGoBack}
            className="h-8 w-8 text-slate-400 hover:text-slate-100 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold text-slate-100 min-w-[160px] text-center">
            {formatMonthYear(new Date(currentYear, currentMonth))}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={goToNextMonth}
            disabled={!canGoForward}
            className="h-8 w-8 text-slate-400 hover:text-slate-100 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {!isCurrentMonth && (
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            className="text-xs border-slate-700 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            Today
          </Button>
        )}
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-slate-500 py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} className="aspect-square" />;
          }

          const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const summary = dayMap.get(dateStr);
          const intensity = summary ? summary.total_keys / maxKeys : 0;
          const hasData = summary && summary.total_keys > 0;

          const cellDate = new Date(currentYear, currentMonth, day);
          const isToday = isSameDay(cellDate, today);
          const isFuture = cellDate > today;

          return (
            <Link
              key={dateStr}
              to={hasData ? `/day/${dateStr}` : "#"}
              className={`group relative ${!hasData ? "pointer-events-none" : ""}`}
            >
              <div
                className={`
                  aspect-square rounded-md flex flex-col items-center justify-center
                  transition-all
                  ${getIntensityColor(intensity)}
                  ${hasData ? "hover:ring-2 hover:ring-cyan-400/50 cursor-pointer" : ""}
                  ${isToday ? "ring-2 ring-violet-500/70" : ""}
                  ${isFuture ? "opacity-30" : ""}
                `}
              >
                <span
                  className={`
                    text-sm font-medium
                    ${hasData ? "text-slate-100" : "text-slate-600"}
                    ${isToday ? "text-violet-300" : ""}
                  `}
                >
                  {day}
                </span>
                {hasData && (
                  <span className="text-[10px] text-cyan-300/80 hidden sm:block">
                    {summary.total_keys >= 1000
                      ? `${Math.round(summary.total_keys / 1000)}k`
                      : summary.total_keys}
                  </span>
                )}
              </div>

              {/* Tooltip */}
              {hasData && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 shadow-xl whitespace-nowrap">
                    <p className="text-slate-100 text-xs font-medium">
                      {cellDate.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    <p className="text-cyan-400 text-xs">
                      {summary.total_keys.toLocaleString()} keys
                    </p>
                    <p className="text-slate-400 text-xs">
                      {summary.unique_apps} apps
                    </p>
                  </div>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-slate-500">
          Click a day to view details
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-sm bg-slate-800/30" />
            <div className="w-3 h-3 rounded-sm bg-cyan-950/80" />
            <div className="w-3 h-3 rounded-sm bg-cyan-900/80" />
            <div className="w-3 h-3 rounded-sm bg-cyan-700/80" />
            <div className="w-3 h-3 rounded-sm bg-cyan-500/80" />
            <div className="w-3 h-3 rounded-sm bg-cyan-400" />
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
