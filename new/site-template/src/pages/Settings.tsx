import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Plus, Trash2 } from "lucide-react";

interface CategoryRule {
  pattern: string;
  category: string;
}

interface Settings {
  title_mappings?: CategoryRule[];
  hacking_categories?: string[];
  day_boundary_hour?: number;
}

export default function Settings() {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Local state for editing
  const [mappings, setMappings] = useState<CategoryRule[]>([]);
  const [hackingCategories, setHackingCategories] = useState<string>("");

  useEffect(() => {
    fetch("/api/ulogme/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
        setMappings(data.title_mappings || []);
        setHackingCategories(
          (data.hacking_categories || []).join(", ")
        );
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const handleAddMapping = () => {
    setMappings([...mappings, { pattern: "", category: "" }]);
  };

  const handleRemoveMapping = (index: number) => {
    setMappings(mappings.filter((_, i) => i !== index));
  };

  const handleMappingChange = (
    index: number,
    field: "pattern" | "category",
    value: string
  ) => {
    const updated = [...mappings];
    updated[index][field] = value;
    setMappings(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const hackingCats = hackingCategories
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await fetch("/api/ulogme/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title_mappings: mappings.filter(
            (m) => m.pattern && m.category
          ),
          hacking_categories: hackingCats,
        }),
      });

      setMessage("Settings saved successfully!");
    } catch (err) {
      console.error(err);
      setMessage("Failed to save settings");
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 p-6">
        <div className="max-w-3xl mx-auto">
          <p className="text-slate-400">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="text-slate-400 hover:text-slate-100"
            >
              <Link to="/overview">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-xl font-bold text-slate-100">Settings</h1>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {message && (
          <div
            className={`p-4 rounded-lg ${
              message.includes("success")
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}
          >
            {message}
          </div>
        )}

        {/* Category Mappings */}
        <Card className="bg-slate-900/50 border-slate-800/50">
          <CardHeader>
            <CardTitle className="text-slate-100">Category Mappings</CardTitle>
            <CardDescription className="text-slate-400">
              Define regex patterns to categorize window titles. First match
              wins, so order matters.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mappings.map((mapping, index) => (
              <div key={index} className="flex gap-3 items-start">
                <div className="flex-1 space-y-2">
                  <Label className="text-slate-400 text-xs">Pattern (regex)</Label>
                  <Input
                    value={mapping.pattern}
                    onChange={(e) =>
                      handleMappingChange(index, "pattern", e.target.value)
                    }
                    placeholder="Google Chrome|Safari"
                    className="bg-slate-800/50 border-slate-700 text-slate-100"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Label className="text-slate-400 text-xs">Category</Label>
                  <Input
                    value={mapping.category}
                    onChange={(e) =>
                      handleMappingChange(index, "category", e.target.value)
                    }
                    placeholder="Browser"
                    className="bg-slate-800/50 border-slate-700 text-slate-100"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveMapping(index)}
                  className="mt-7 text-slate-500 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <Button
              variant="outline"
              onClick={handleAddMapping}
              className="w-full border-dashed border-slate-700 text-slate-400 hover:text-slate-100 hover:border-slate-600"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Mapping
            </Button>
          </CardContent>
        </Card>

        {/* Hacking Categories */}
        <Card className="bg-slate-900/50 border-slate-800/50">
          <CardHeader>
            <CardTitle className="text-slate-100">Focus Categories</CardTitle>
            <CardDescription className="text-slate-400">
              Categories considered "focused work" for the activity heatmap.
              Comma-separated.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              value={hackingCategories}
              onChange={(e) => setHackingCategories(e.target.value)}
              placeholder="Coding, Terminal, Editor"
              className="bg-slate-800/50 border-slate-700 text-slate-100"
            />
          </CardContent>
        </Card>

        {/* Tracker Info */}
        <Card className="bg-slate-900/50 border-slate-800/50">
          <CardHeader>
            <CardTitle className="text-slate-100">Tracker Information</CardTitle>
            <CardDescription className="text-slate-400">
              Status and configuration of the ulogme tracker daemon
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-slate-800/50 rounded-lg p-4 font-mono text-sm">
              <p className="text-slate-400">
                <span className="text-cyan-400">Database:</span>{" "}
                <span className="text-slate-300">data/ulogme.duckdb</span>
              </p>
              <p className="text-slate-400 mt-2">
                <span className="text-cyan-400">Day Boundary:</span>{" "}
                <span className="text-slate-300">7:00 AM</span>
              </p>
            </div>

            <div className="text-sm text-slate-500 space-y-1">
              <p>
                To start the tracker:{" "}
                <code className="text-cyan-400">uv run python -m tracker start</code>
              </p>
              <p>
                To install as service:{" "}
                <code className="text-cyan-400">uv run python -m tracker install</code>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Save button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-cyan-600 hover:bg-cyan-500 text-white"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </main>
    </div>
  );
}

