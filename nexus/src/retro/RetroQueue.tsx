import * as React from "react";
import { useQueueStore } from "@/stores/queueStore";
import { useGameStore, type Game } from "@/stores/gameStore";
import { fmtDate } from "./format";

export interface RetroQueueProps {
  enabled: boolean;
  onBack: () => void;
  onLaunch: (game: Game) => void;
}

export function RetroQueue({ enabled, onBack, onLaunch }: RetroQueueProps) {
  const entries = useQueueStore((s) => s.entries);
  const [sel, setSel] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    useQueueStore.getState().fetch();
  }, []);

  React.useEffect(() => {
    setSel((s) => Math.min(s, Math.max(0, entries.length - 1)));
  }, [entries.length]);

  const move = React.useCallback((idx: number, dir: -1 | 1) => {
    const list = useQueueStore.getState().entries;
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    const ids = list.map((e) => e.gameId);
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    useQueueStore.getState().reorder(ids);
    setSel(target);
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      const entry = entries[sel];
      switch (e.key) {
        case "Escape": e.preventDefault(); onBack(); break;
        case "ArrowDown": e.preventDefault(); setSel((s) => Math.min(entries.length - 1, s + 1)); break;
        case "ArrowUp": e.preventDefault(); setSel((s) => Math.max(0, s - 1)); break;
        case "Enter":
        case "F8": {
          e.preventDefault();
          if (!entry) break;
          const game = useGameStore.getState().games.find((g) => g.id === entry.gameId);
          if (game) onLaunch(game);
          break;
        }
        case "Delete":
          e.preventDefault();
          if (entry) useQueueStore.getState().remove(entry.gameId, entry.name);
          break;
        case "+":
        case "=":
          e.preventDefault();
          move(sel, -1);
          break;
        case "-":
          e.preventDefault();
          move(sel, 1);
          break;
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [enabled, entries, sel, move, onBack, onLaunch]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }} data-testid="retro-queue">
      <div className="retro-panel" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div className="retro-panel-header">
          <span>PLAY QUEUE ({entries.length})</span>
          <span>[+/-=MOVE | DEL=REMOVE]</span>
        </div>
        <div className="retro-th">
          <span style={{ width: "5ch" }}>###</span>
          <span style={{ flex: 1 }}>TITLE</span>
          <span style={{ width: "7ch" }}>SRC</span>
          <span style={{ width: "7ch" }}>STAT</span>
          <span style={{ width: "11ch", textAlign: "right" }}>QUEUED</span>
        </div>
        <div ref={listRef} className="retro-scroll" style={{ flex: 1, minHeight: 0 }}>
          {entries.length === 0 ? (
            <div className="retro-row retro-dim">QUEUE EMPTY - ADD TITLES FROM MODERN UI OR PLAY FREELY</div>
          ) : (
            entries.map((entry, i) => (
              <div
                key={entry.id}
                data-testid={`retro-queue-row-${i}`}
                className={i === sel ? "retro-row retro-row-selected" : "retro-row"}
                onMouseDown={() => setSel(i)}
              >
                <span style={{ width: "5ch" }}>{String(i + 1).padStart(2, "0")}</span>
                <span className="retro-value" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {entry.name}
                </span>
                <span style={{ width: "7ch" }}>{entry.source.toUpperCase().slice(0, 5)}</span>
                <span style={{ width: "7ch" }}>{entry.status.toUpperCase().slice(0, 4)}</span>
                <span style={{ width: "11ch", textAlign: "right" }}>{fmtDate(entry.addedAt)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
