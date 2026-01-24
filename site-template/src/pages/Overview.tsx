import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, TrendingUp, Calendar, Keyboard } from "lucide-react";
import { OverviewChart } from "@/components/ulogme/OverviewChart";
import { HackingStreak } from "@/components/ulogme/HackingStreak";
import { MonthlyCalendar } from "@/components/ulogme/MonthlyCalendar";

interface DailySummary {
  logical_date: string;
  total_keys: number;
  unique_apps: number;
}

export default function Overview() {
  const [overview, setOverview] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ulogme/overview")
      .then((r) => r.json())
      .then((data) => {
        setOverview(data.days || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  // Get last 30 days for stats and heatmap
  const last30Days = overview.slice(0, 30);

  // Calculate totals (for last 30 days)
  const totalKeystrokes = last30Days.reduce((sum, d) => sum + d.total_keys, 0);
  const avgKeystrokes = last30Days.length > 0 ? Math.round(totalKeystrokes / last30Days.length) : 0;
  const activeDays = last30Days.filter((d) => d.total_keys > 0).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                ulogme
              </h1>
              <span className="text-slate-500 text-sm">
                Personal Activity Tracker
              </span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              asChild
              className="text-slate-400 hover:text-slate-100"
            >
              <Link to="/settings">
                <Settings className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-slate-900/50 border-slate-800/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-cyan-500/10">
                  <Keyboard className="h-6 w-6 text-cyan-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-slate-100">
                    {totalKeystrokes.toLocaleString()}
                  </p>
                  <p className="text-sm text-slate-500">Total Keystrokes (30 days)</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-blue-500/10">
                  <TrendingUp className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-slate-100">
                    {avgKeystrokes.toLocaleString()}
                  </p>
                  <p className="text-sm text-slate-500">Avg. Daily Keystrokes</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-violet-500/10">
                  <Calendar className="h-6 w-6 text-violet-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-slate-100">{activeDays}</p>
                  <p className="text-sm text-slate-500">Active Days</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Hacking streak */}
        <Card className="bg-slate-900/50 border-slate-800/50">
          <CardHeader>
            <CardTitle className="text-slate-100">Activity Heatmap</CardTitle>
            <CardDescription className="text-slate-400">
              Daily keystroke intensity over the past 30 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HackingStreak days={last30Days} />
          </CardContent>
        </Card>

        {/* Overview chart */}
        <Card className="bg-slate-900/50 border-slate-800/50">
          <CardHeader>
            <CardTitle className="text-slate-100">Daily Activity</CardTitle>
            <CardDescription className="text-slate-400">
              Keystrokes and app usage per day
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OverviewChart days={last30Days} />
          </CardContent>
        </Card>

        {/* Calendar */}
        <Card className="bg-slate-900/50 border-slate-800/50">
          <CardHeader>
            <CardTitle className="text-slate-100">Browse History</CardTitle>
            <CardDescription className="text-slate-400">
              Navigate by month to explore your activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyCalendar days={overview} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

