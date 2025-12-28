import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Clock } from "lucide-react";

interface Note {
  timestamp: string;
  content: string;
}

interface Props {
  notes: Note[];
  logicalDate: string;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NotesPanel({ notes, logicalDate }: Props) {
  const [newNote, setNewNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [localNotes, setLocalNotes] = useState<Note[]>(notes);

  const handleAddNote = async () => {
    if (!newNote.trim() || !logicalDate) return;

    setAdding(true);
    const timestamp = new Date().toISOString();

    try {
      await fetch("/api/ulogme/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestamp,
          content: newNote.trim(),
          logical_date: logicalDate,
        }),
      });

      setLocalNotes([...localNotes, { timestamp, content: newNote.trim() }]);
      setNewNote("");
    } catch (err) {
      console.error(err);
    }

    setAdding(false);
  };

  return (
    <div className="space-y-4">
      {/* Add note form */}
      <div className="flex gap-2">
        <Input
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a note..."
          className="bg-slate-800/50 border-slate-700 text-slate-100 placeholder:text-slate-500"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAddNote();
            }
          }}
        />
        <Button
          onClick={handleAddNote}
          disabled={adding || !newNote.trim()}
          size="icon"
          className="bg-cyan-600 hover:bg-cyan-500 text-white shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Notes list */}
      <div className="space-y-2 max-h-[250px] overflow-y-auto">
        {localNotes.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">
            No notes yet. Add one above!
          </p>
        ) : (
          localNotes
            .sort(
              (a, b) =>
                new Date(a.timestamp).getTime() -
                new Date(b.timestamp).getTime()
            )
            .map((note, index) => (
              <div
                key={`${note.timestamp}-${index}`}
                className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50"
              >
                <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                  <Clock className="h-3 w-3" />
                  {formatTime(note.timestamp)}
                </div>
                <p className="text-slate-300 text-sm">{note.content}</p>
              </div>
            ))
        )}
      </div>
    </div>
  );
}

