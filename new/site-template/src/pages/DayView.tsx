import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Keyboard,
  Clock,
  FileText,
  Settings,
} from "lucide-react";
import { ActivityTimeline } from "@/components/ulogme/ActivityTimeline";
import { KeystrokeChart } from "@/components/ulogme/KeystrokeChart";
import { CategoryPieChart } from "@/components/ulogme/CategoryPieChart";
import { CategoryStats } from "@/components/ulogme/CategoryStats";
import { NotesPanel } from "@/components/ulogme/NotesPanel";

interface WindowEvent {
  timestamp: string;
  app_name: string;
  window_title: string | null;
  browser_url: string | null;
}

interface KeyEvent {
  timestamp: string;
  key_count: number;
}

interface Note {
  timestamp: string;
  content: string;
}

interface DayData {
  logical_date: string;
  window_events: WindowEvent[];
  key_events: KeyEvent[];
  notes: Note[];
  blog: string | null;
}

interface DateInfo {
  logical_date: string;
  label: string;
}

export default function DayView() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();

  const [dayData, setDayData] = useState<DayData | null>(null);
  const [availableDates, setAvailableDates] = useState<DateInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [blogContent, setBlogContent] = useState("");
  const [savingBlog, setSavingBlog] = useState(false);

  // Fetch available dates
  useEffect(() => {
    fetch("/api/ulogme/dates")
      .then((res) => res.json())
      .then((data) => {
        setAvailableDates(data.dates || []);
      })
      .catch(console.error);
  }, []);

  // Fetch day data
  useEffect(() => {
    if (!date) return;

    setLoading(true);
    fetch(`/api/ulogme/day/${date}`)
      .then((res) => res.json())
      .then((data) => {
        setDayData(data);
        setBlogContent(data.blog || "");
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [date]);

  // Navigation helpers
  const currentIndex = availableDates.findIndex((d) => d.logical_date === date);
  const prevDate = currentIndex < availableDates.length - 1 ? availableDates[currentIndex + 1] : null;
  const nextDate = currentIndex > 0 ? availableDates[currentIndex - 1] : null;

  const currentDateInfo = availableDates.find((d) => d.logical_date === date);

  // Calculate stats
  const totalKeystrokes = dayData?.key_events.reduce((sum, e) => sum + e.key_count, 0) || 0;
  const uniqueApps = new Set(dayData?.window_events.map((e) => e.app_name)).size;

  // Save blog
  const handleSaveBlog = async () => {
    if (!date) return;
    setSavingBlog(true);
    try {
      await fetch(`/api/ulogme/blog/${date}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: blogContent }),
      });
    } catch (err) {
      console.error(err);
    }
    setSavingBlog(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-96 lg:col-span-2" />
            <Skeleton className="h-96" />
          </div>
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
              <Link
                to="/overview"
                className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent"
              >
                ulogme
              </Link>
              <span className="text-slate-500">/</span>
              <span className="text-slate-300">{currentDateInfo?.label || date}</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => prevDate && navigate(`/day/${prevDate.logical_date}`)}
                disabled={!prevDate}
                className="text-slate-400 hover:text-slate-100"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => nextDate && navigate(`/day/${nextDate.logical_date}`)}
                disabled={!nextDate}
                className="text-slate-400 hover:text-slate-100"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
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
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10">
                  <Keyboard className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-100">
                    {totalKeystrokes.toLocaleString()}
                  </p>
                  <p className="text-sm text-slate-500">Keystrokes</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Clock className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-100">
                    {dayData?.window_events.length || 0}
                  </p>
                  <p className="text-sm text-slate-500">Window Events</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-violet-500/10">
                  <Calendar className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-100">{uniqueApps}</p>
                  <p className="text-sm text-slate-500">Unique Apps</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <FileText className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-100">
                    {dayData?.notes.length || 0}
                  </p>
                  <p className="text-sm text-slate-500">Notes</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main charts grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Timeline - full width on mobile, 2 cols on large */}
          <Card className="lg:col-span-2 bg-slate-900/50 border-slate-800/50">
            <CardHeader>
              <CardTitle className="text-slate-100">Activity Timeline</CardTitle>
              <CardDescription className="text-slate-400">
                Window activity throughout the day
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityTimeline events={dayData?.window_events || []} />
            </CardContent>
          </Card>

          {/* Category pie chart */}
          <Card className="bg-slate-900/50 border-slate-800/50">
            <CardHeader>
              <CardTitle className="text-slate-100">Time Distribution</CardTitle>
              <CardDescription className="text-slate-400">
                Time spent per application
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CategoryPieChart events={dayData?.window_events || []} />
            </CardContent>
          </Card>
        </div>

        {/* Keystroke chart */}
        <Card className="bg-slate-900/50 border-slate-800/50">
          <CardHeader>
            <CardTitle className="text-slate-100">Keystroke Activity</CardTitle>
            <CardDescription className="text-slate-400">
              Typing intensity over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <KeystrokeChart events={dayData?.key_events || []} />
          </CardContent>
        </Card>

        {/* Bottom grid - stats and notes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Category stats */}
          <Card className="bg-slate-900/50 border-slate-800/50">
            <CardHeader>
              <CardTitle className="text-slate-100">App Usage</CardTitle>
              <CardDescription className="text-slate-400">
                Time spent in each application
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CategoryStats events={dayData?.window_events || []} />
            </CardContent>
          </Card>

          {/* Notes panel */}
          <Card className="bg-slate-900/50 border-slate-800/50">
            <CardHeader>
              <CardTitle className="text-slate-100">Notes</CardTitle>
              <CardDescription className="text-slate-400">
                Annotations and reminders
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NotesPanel
                notes={dayData?.notes || []}
                logicalDate={date || ""}
              />
            </CardContent>
          </Card>
        </div>

        {/* Daily blog */}
        <Card className="bg-slate-900/50 border-slate-800/50">
          <CardHeader>
            <CardTitle className="text-slate-100">Daily Log</CardTitle>
            <CardDescription className="text-slate-400">
              Personal notes and reflections for the day
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={blogContent}
              onChange={(e) => setBlogContent(e.target.value)}
              placeholder="What did you accomplish today? What are you thinking about?"
              className="min-h-[150px] bg-slate-800/50 border-slate-700 text-slate-100 placeholder:text-slate-500 resize-none"
            />
            <div className="flex justify-end">
              <Button
                onClick={handleSaveBlog}
                disabled={savingBlog}
                className="bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                {savingBlog ? "Saving..." : "Save Log"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

