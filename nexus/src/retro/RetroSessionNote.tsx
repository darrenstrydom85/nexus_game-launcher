import * as React from "react";
import { useSessionNoteStore } from "@/stores/sessionNoteStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { updateSessionNote } from "@/lib/tauri";
import { RetroModal } from "./RetroModal";
import { fmtDur } from "./format";

/**
 * DOS version of SessionNotePrompt. Self-contained: reads the note queue and
 * the prompt settings itself. Enter saves, Esc skips, typing resets the
 * auto-dismiss timer (same contract as the modern prompt).
 */
export function RetroSessionNote() {
  const queue = useSessionNoteStore((s) => s.queue);
  const dequeue = useSessionNoteStore((s) => s.dequeue);
  const enabled = useSettingsStore((s) => s.sessionNotePromptEnabled);
  const timeoutS = useSettingsStore((s) => s.sessionNotePromptTimeout);

  const current = enabled ? queue[0] ?? null : null;
  const [note, setNote] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setNote("");
  }, [current?.sessionId]);

  React.useEffect(() => {
    if (current) inputRef.current?.focus();
  }, [current]);

  // Auto-dismiss; `note` in deps restarts the timer on every keystroke.
  React.useEffect(() => {
    if (!current || timeoutS <= 0) return;
    const id = setTimeout(() => dequeue(), timeoutS * 1000);
    return () => clearTimeout(id);
  }, [current, timeoutS, note, dequeue]);

  if (!current) return null;

  const save = async () => {
    if (note.trim()) {
      try {
        await updateSessionNote(current.sessionId, note.trim());
      } catch {
        // best-effort, matches modern prompt
      }
    }
    dequeue();
  };

  return (
    <RetroModal title="SESSION ENDED" footer="ENTER=SAVE | ESC=SKIP">
      <div className="retro-row" style={{ padding: 0 }} data-testid="retro-session-note">
        <span style={{ width: "10ch" }}>TITLE</span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{current.gameName}</span>
      </div>
      <div className="retro-row" style={{ padding: 0 }}>
        <span style={{ width: "10ch" }}>LENGTH</span>
        <span>{fmtDur(current.durationS)}</span>
      </div>
      <div style={{ display: "flex", marginTop: 4 }}>
        <span>NOTE :</span>
        <input
          ref={inputRef}
          data-testid="retro-session-note-input"
          className="retro-input"
          style={{ flex: 1 }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              dequeue();
            }
          }}
          onBlur={() => inputRef.current?.focus()}
          aria-label="Session note"
        />
      </div>
    </RetroModal>
  );
}
