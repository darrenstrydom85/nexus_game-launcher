import * as React from "react";
import { MessageSquarePlus, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateSessionNote } from "@/lib/tauri";

interface InlineNoteEditProps {
  sessionId: string;
  note: string | null;
  onNoteUpdated?: (sessionId: string, note: string | null) => void;
}

export function InlineNoteEdit({ sessionId, note, onNoteUpdated }: InlineNoteEditProps) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(note ?? "");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) {
      setValue(note ?? "");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing, note]);

  const save = React.useCallback(async () => {
    const trimmed = value.trim();
    const newNote = trimmed || null;
    setEditing(false);
    if (newNote !== note) {
      try {
        await updateSessionNote(sessionId, newNote);
        onNoteUpdated?.(sessionId, newNote);
      } catch {
        // best-effort
      }
    }
  }, [sessionId, value, note, onNoteUpdated]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      } else if (e.key === "Escape") {
        setEditing(false);
      }
    },
    [save],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        data-testid="session-note-inline-input"
        className={cn(
          "w-full rounded border border-border bg-background px-2 py-1",
          "text-xs text-foreground placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-1 focus:ring-ring",
        )}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        placeholder="Add a note..."
      />
    );
  }

  return (
    <div className="flex items-start gap-1">
      {note ? (
        <p
          className="flex-1 whitespace-pre-wrap text-xs text-muted-foreground"
          data-testid="session-note-text"
        >
          {note}
        </p>
      ) : null}
      <button
        data-testid={note ? "session-note-edit-btn" : "session-note-add-btn"}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded",
          "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        )}
        onClick={() => setEditing(true)}
        aria-label={note ? "Edit note" : "Add note"}
        title={note ? "Edit note" : "Add note"}
      >
        {note ? <Pencil className="size-3" /> : <MessageSquarePlus className="size-3" />}
      </button>
    </div>
  );
}
