import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "motion/react";
import { Pencil, Trash2, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGameStore, refreshGames } from "@/stores/gameStore";
import type { Game } from "@/stores/gameStore";

interface GameNotesProps {
  game: Game;
}

export function GameNotes({ game }: GameNotesProps) {
  const hasNote = game.notes != null && game.notes.length > 0;

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(game.notes ?? "");
  const [expanded, setExpanded] = React.useState(hasNote);
  const [saved, setSaved] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const savedTimerRef = React.useRef<ReturnType<typeof setTimeout>>();
  const isSavingRef = React.useRef(false);

  React.useEffect(() => {
    setDraft(game.notes ?? "");
  }, [game.notes]);

  React.useEffect(() => {
    setExpanded(game.notes != null && game.notes.length > 0);
  }, [game.id]);

  React.useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.selectionStart = el.value.length;
          el.selectionEnd = el.value.length;
          autoGrow(el);
        }
      });
    }
  }, [editing]);

  React.useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  function handleDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(e.target.value);
    autoGrow(e.target);
  }

  async function saveNote(value: string) {
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    const trimmed = value.trim();
    const notesValue = trimmed.length > 0 ? trimmed : null;

    if (notesValue === (game.notes ?? null)) {
      isSavingRef.current = false;
      setEditing(false);
      return;
    }

    const games = useGameStore.getState().games;
    useGameStore.getState().setGames(
      games.map((g) =>
        g.id === game.id ? { ...g, notes: notesValue } : g,
      ) as Game[],
    );

    try {
      await invoke("update_game", {
        id: game.id,
        fields: { notes: notesValue },
      });
      await refreshGames();
      showSavedIndicator();
    } catch {
      useGameStore.getState().setGames(games);
    } finally {
      isSavingRef.current = false;
      setEditing(false);
    }
  }

  function showSavedIndicator() {
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 1500);
  }

  function handleBlur() {
    saveNote(draft);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      textareaRef.current?.blur();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setDraft(game.notes ?? "");
      setEditing(false);
    }
  }

  function handleStartEditing() {
    setDraft(game.notes ?? "");
    setEditing(true);
    if (!expanded) setExpanded(true);
  }

  async function handleClear() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }

    setConfirmClear(false);
    setEditing(false);
    setDraft("");

    const games = useGameStore.getState().games;
    useGameStore.getState().setGames(
      games.map((g) =>
        g.id === game.id ? { ...g, notes: null } : g,
      ) as Game[],
    );

    try {
      await invoke("update_game", {
        id: game.id,
        fields: { notes: null },
      });
      await refreshGames();
    } catch {
      useGameStore.getState().setGames(games);
    }
  }

  function handleCancelClear() {
    setConfirmClear(false);
  }

  function handleToggle() {
    if (!expanded) {
      setExpanded(true);
    } else if (!editing) {
      setExpanded(false);
    }
  }

  function handleSectionKeyDown(e: React.KeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" && !editing) {
      e.preventDefault();
      if (!hasNote) {
        handleStartEditing();
      } else {
        handleToggle();
      }
    }
  }

  return (
    <div
      data-testid="game-notes"
      className="rounded-lg border border-border bg-card p-4"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          data-testid="notes-toggle"
          className={cn(
            "flex flex-1 items-center gap-2 text-left",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded",
          )}
          onClick={handleToggle}
          onKeyDown={handleSectionKeyDown}
          aria-expanded={expanded}
          aria-controls="notes-content"
        >
          <ChevronDown
            className={cn(
              "size-3.5 text-muted-foreground transition-transform duration-200",
              !expanded && "-rotate-90",
            )}
          />
          <h3 className="text-sm font-semibold text-foreground">Notes</h3>
        </button>

        {/* Saved indicator */}
        <AnimatePresence>
          {saved && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex items-center gap-1 text-xs text-green-500"
              aria-live="polite"
            >
              <Check className="size-3" />
              Saved
            </motion.span>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        {hasNote && !editing && (
          <div className="flex items-center gap-1">
            <button
              data-testid="notes-edit"
              className={cn(
                "rounded p-1 text-muted-foreground transition-colors hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
              onClick={handleStartEditing}
              aria-label="Edit note"
            >
              <Pencil className="size-3.5" />
            </button>

            {!confirmClear ? (
              <button
                data-testid="notes-clear"
                className={cn(
                  "rounded p-1 text-muted-foreground transition-colors hover:text-destructive",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                )}
                onClick={handleClear}
                aria-label="Clear note"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : (
              <span className="flex items-center gap-1 text-xs">
                <span className="text-muted-foreground">Clear?</span>
                <button
                  data-testid="notes-clear-confirm"
                  className="font-medium text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={handleClear}
                >
                  Yes
                </button>
                <button
                  data-testid="notes-clear-cancel"
                  className="text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={handleCancelClear}
                >
                  No
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Collapsible content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id="notes-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="pt-3">
              {editing ? (
                <textarea
                  ref={textareaRef}
                  data-testid="notes-textarea"
                  value={draft}
                  onChange={handleDraftChange}
                  onBlur={handleBlur}
                  onKeyDown={handleKeyDown}
                  rows={3}
                  className={cn(
                    "w-full resize-none rounded-md border border-border bg-card px-3 py-2",
                    "text-sm leading-relaxed text-foreground",
                    "placeholder:text-muted-foreground",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  )}
                  style={{ maxHeight: "300px", overflowY: "auto" }}
                  placeholder="Write your notes here..."
                  aria-label="Game notes"
                />
              ) : hasNote ? (
                <button
                  data-testid="notes-display"
                  className={cn(
                    "w-full cursor-text rounded-md px-3 py-2 text-left",
                    "text-sm leading-relaxed text-muted-foreground",
                    "whitespace-pre-wrap break-words",
                    "transition-colors hover:bg-white/[0.02]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  )}
                  onClick={handleStartEditing}
                  aria-label="Click to edit note"
                >
                  {game.notes}
                </button>
              ) : (
                <button
                  data-testid="notes-placeholder"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-3 py-2",
                    "text-sm text-muted-foreground",
                    "transition-colors hover:bg-white/[0.02] hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  )}
                  onClick={handleStartEditing}
                  aria-label="Add a note"
                >
                  <Pencil className="size-3.5" />
                  Add a note...
                </button>
              )}
              <p className="mt-1.5 text-[11px] text-muted-foreground/60">
                {editing ? "Ctrl+Enter to save · Escape to cancel" : ""}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
