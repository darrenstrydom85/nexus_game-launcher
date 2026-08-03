import * as React from "react";
import { listRunningProcesses, type RunningProcessInfo } from "@/lib/tauri";

export interface RetroProcessPickerProps {
  gameName: string;
  onProcessSelected: (exeName: string, pid: number) => void;
  onCancel: () => void;
}

/**
 * DOS-style take on ProcessPickerModal: the "customer not on file" popup.
 * Same flow — pick the running process for the launched game, or Esc twice
 * (with Y/N confirm) to end the tracking session.
 */
export function RetroProcessPicker({ gameName, onProcessSelected, onCancel }: RetroProcessPickerProps) {
  const [processes, setProcesses] = React.useState<RunningProcessInfo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [sel, setSel] = React.useState(0);
  const [confirmEnd, setConfirmEnd] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const fetchProcesses = React.useCallback(async () => {
    setLoading(true);
    try {
      setProcesses(await listRunningProcesses(false));
    } catch {
      setProcesses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchProcesses();
  }, [fetchProcesses]);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, [loading, confirmEnd]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return processes;
    return processes.filter(
      (p) =>
        p.exeName.toLowerCase().includes(q) ||
        (p.windowTitle && p.windowTitle.toLowerCase().includes(q)),
    );
  }, [processes, query]);

  React.useEffect(() => {
    setSel((s) => Math.min(s, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const move = (delta: number) => {
    setSel((s) => {
      const next = Math.max(0, Math.min(filtered.length - 1, s + delta));
      listRef.current
        ?.querySelector<HTMLElement>(`[data-idx="${next}"]`)
        ?.scrollIntoView?.({ block: "nearest" });
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (confirmEnd) {
      if (e.key.toLowerCase() === "y") { e.preventDefault(); onCancel(); }
      else if (e.key.toLowerCase() === "n" || e.key === "Escape") { e.preventDefault(); setConfirmEnd(false); }
      return;
    }
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); move(1); break;
      case "ArrowUp": e.preventDefault(); move(-1); break;
      case "PageDown": e.preventDefault(); move(10); break;
      case "PageUp": e.preventDefault(); move(-10); break;
      case "Enter":
        e.preventDefault();
        if (filtered[sel]) onProcessSelected(filtered[sel].exeName, filtered[sel].pid);
        break;
      case "F5": e.preventDefault(); fetchProcesses(); break;
      case "Escape": e.preventDefault(); setConfirmEnd(true); break;
    }
  };

  return (
    <div className="retro-popup-overlay" data-testid="retro-process-picker">
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
      <div className="retro-popup" style={{ position: "relative", display: "flex", flexDirection: "column", minHeight: "20em" }}>
        <div>GAME PROCESS NOT ON FILE - SELECT MANUALLY</div>
        <div>TITLE: {gameName}</div>
        <div style={{ display: "flex" }}>
          <span>FIND :</span>
          <input
            ref={inputRef}
            data-testid="retro-process-search"
            className="retro-input"
            style={{ flex: 1, background: "transparent", color: "inherit" }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => inputRef.current?.focus()}
            aria-label="Filter processes"
          />
        </div>
        <div style={{ borderTop: "1px solid #000" }} />
        <div ref={listRef} className="retro-scroll" style={{ flex: 1, minHeight: 0, maxHeight: "14em" }}>
          {loading ? (
            <div>READING PROCESS TABLE...</div>
          ) : filtered.length === 0 ? (
            <div>NO PROCESSES FOUND - F5 TO RESCAN</div>
          ) : (
            filtered.map((p, i) => (
              <div
                key={`${p.exeName}-${p.pid}`}
                data-idx={i}
                data-testid={`retro-process-row-${i}`}
                className={i === sel ? "retro-row retro-row-selected" : "retro-row"}
                style={{ display: "flex", padding: 0 }}
                onMouseDown={() => setSel(i)}
                onDoubleClick={() => onProcessSelected(p.exeName, p.pid)}
              >
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{p.exeName}</span>
                <span style={{ width: "24ch", overflow: "hidden", textOverflow: "ellipsis" }}>{p.windowTitle ?? ""}</span>
                <span style={{ width: "8ch", textAlign: "right" }}>{p.pid}</span>
              </div>
            ))
          )}
        </div>
        <div style={{ borderTop: "1px solid #000" }} />
        {confirmEnd ? (
          <div data-testid="retro-process-confirm-end">END PLAY SESSION? (Y/N) <span className="retro-blink">_</span></div>
        ) : (
          <div>ENTER=SELECT | F5=RESCAN | ESC=END SESSION</div>
        )}
      </div>
    </div>
  );
}
