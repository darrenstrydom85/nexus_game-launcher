import * as React from "react";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useCollectionStore } from "@/stores/collectionStore";
import { RetroModal } from "./RetroModal";
import { SOURCE_CODE, STATUS_CODE, fmtHours, fmtDate, fmtStars } from "./format";

const SORTS: { label: string; cmp: (a: Game, b: Game) => number }[] = [
  { label: "NAME", cmp: (a, b) => a.name.localeCompare(b.name) },
  { label: "LAST PLAYED", cmp: (a, b) => (b.lastPlayedAt ?? "").localeCompare(a.lastPlayedAt ?? "") },
  { label: "HOURS", cmp: (a, b) => b.totalPlayTimeS - a.totalPlayTimeS },
  { label: "ADDED", cmp: (a, b) => b.addedAt.localeCompare(a.addedAt) },
];

export interface RetroLibraryProps {
  /** False while a popup owns the keyboard. */
  enabled: boolean;
  onOpenDetail: (game: Game) => void;
  onLaunch: (game: Game) => void;
}

export function RetroLibrary({ enabled, onOpenDetail, onLaunch }: RetroLibraryProps) {
  const games = useGameStore((s) => s.games);
  const hiddenIds = useSettingsStore((s) => s.hiddenGameIds);
  const collections = useCollectionStore((s) => s.collections);
  const [query, setQuery] = React.useState("");
  const [sortIdx, setSortIdx] = React.useState(0);
  const [sel, setSel] = React.useState(0);
  const [collFilter, setCollFilter] = React.useState<string | null>(null);
  const [collPicker, setCollPicker] = React.useState<number | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const activeCollection = React.useMemo(
    () => collections.find((c) => c.id === collFilter) ?? null,
    [collections, collFilter],
  );

  const visible = React.useMemo(() => {
    const base = games.filter(
      (g) => !g.isHidden && !hiddenIds.includes(g.id) && g.status !== "removed",
    );
    const inColl = activeCollection
      ? base.filter((g) => activeCollection.gameIds.includes(g.id))
      : base;
    const q = query.trim().toLowerCase();
    const filtered = q ? inColl.filter((g) => g.name.toLowerCase().includes(q)) : inColl;
    return [...filtered].sort(SORTS[sortIdx].cmp);
  }, [games, hiddenIds, activeCollection, query, sortIdx]);

  React.useEffect(() => {
    setSel((s) => Math.min(s, Math.max(0, visible.length - 1)));
  }, [visible.length]);

  // The search field owns the keyboard for the whole screen.
  React.useEffect(() => {
    if (enabled) inputRef.current?.focus();
  }, [enabled]);

  const scrollTo = React.useCallback((idx: number) => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${idx}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, []);

  const move = React.useCallback(
    (delta: number) => {
      setSel((s) => {
        const next = Math.max(0, Math.min(visible.length - 1, s + delta));
        scrollTo(next);
        return next;
      });
    },
    [visible.length, scrollTo],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!enabled) return;

    // Collection picker pseudo-modal owns the keys while open.
    if (collPicker != null) {
      const count = collections.length + 1; // + "ALL TITLES"
      if (e.key === "Escape") { e.preventDefault(); setCollPicker(null); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setCollPicker(Math.min(count - 1, collPicker + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setCollPicker(Math.max(0, collPicker - 1)); }
      else if (e.key === "Enter") {
        e.preventDefault();
        setCollFilter(collPicker === 0 ? null : collections[collPicker - 1].id);
        setSel(0);
        setCollPicker(null);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown": e.preventDefault(); move(1); break;
      case "ArrowUp": e.preventDefault(); move(-1); break;
      case "PageDown": e.preventDefault(); move(15); break;
      case "PageUp": e.preventDefault(); move(-15); break;
      case "Home": e.preventDefault(); setSel(0); scrollTo(0); break;
      case "End": e.preventDefault(); setSel(visible.length - 1); scrollTo(visible.length - 1); break;
      case "Enter":
        e.preventDefault();
        if (visible[sel]) onOpenDetail(visible[sel]);
        break;
      case "F8":
        e.preventDefault();
        if (visible[sel]) onLaunch(visible[sel]);
        break;
      case "F3":
        e.preventDefault();
        setSortIdx((i) => (i + 1) % SORTS.length);
        break;
      case "F4":
        e.preventDefault();
        setCollPicker(collFilter ? collections.findIndex((c) => c.id === collFilter) + 1 : 0);
        break;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div className="retro-row" style={{ padding: "2px 4px" }}>
        <span className="retro-label">FIND :</span>
        <input
          ref={inputRef}
          data-testid="retro-search"
          className="retro-input"
          style={{ width: "30ch" }}
          autoFocus
          value={query}
          onChange={(e) => { if (collPicker == null) setQuery(e.target.value); }}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (enabled) inputRef.current?.focus(); }}
          aria-label="Find game"
        />
        <span style={{ flex: 1 }} />
        {activeCollection && (
          <>
            <span className="retro-label">COLL:&nbsp;</span>
            <span className="retro-accent" data-testid="retro-coll-filter">{activeCollection.name}</span>
            <span className="retro-dim">&nbsp;|&nbsp;</span>
          </>
        )}
        <span className="retro-label">SORT:&nbsp;</span>
        <span className="retro-value">{SORTS[sortIdx].label}</span>
        <span className="retro-dim">&nbsp;|&nbsp;</span>
        <span className="retro-value" data-testid="retro-title-count">{visible.length}</span>
        <span className="retro-label">&nbsp;TITLES</span>
      </div>

      <div className="retro-th">
        <span style={{ width: "5ch" }}>###</span>
        <span style={{ flex: 1 }}>TITLE</span>
        <span style={{ width: "7ch" }}>SRC</span>
        <span style={{ width: "6ch" }}>STAT</span>
        <span style={{ width: "8ch", textAlign: "right" }}>HRS</span>
        <span style={{ width: "11ch", textAlign: "right" }}>LAST</span>
        <span style={{ width: "8ch", textAlign: "right" }}>RATE</span>
      </div>

      <div ref={listRef} className="retro-scroll" style={{ flex: 1, minHeight: 0 }} data-testid="retro-library-list">
        {visible.length === 0 ? (
          <div className="retro-row retro-accent" style={{ justifyContent: "center", padding: "16px 0" }}>
            {games.length === 0
              ? "NO TITLES ON FILE - PRESS F5 TO SCAN SOURCES"
              : "NO MATCH FOR QUERY"}
          </div>
        ) : (
          visible.map((g, i) => (
            <div
              key={g.id}
              data-idx={i}
              data-testid={`retro-library-row-${i}`}
              className={i === sel ? "retro-row retro-row-selected" : "retro-row"}
              onMouseDown={() => setSel(i)}
              onDoubleClick={() => onOpenDetail(g)}
            >
              <span style={{ width: "5ch" }}>{String(i + 1).padStart(3, "0")}</span>
              <span className="retro-value" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                {g.name}
              </span>
              <span style={{ width: "7ch" }}>{SOURCE_CODE[g.source]}</span>
              <span style={{ width: "6ch" }}>{STATUS_CODE[g.status]}</span>
              <span style={{ width: "8ch", textAlign: "right" }}>{fmtHours(g.totalPlayTimeS)}</span>
              <span style={{ width: "11ch", textAlign: "right" }}>{fmtDate(g.lastPlayedAt)}</span>
              <span className="retro-accent" style={{ width: "8ch", textAlign: "right" }}>{fmtStars(g.rating)}</span>
            </div>
          ))
        )}
      </div>

      {collPicker != null && (
        <RetroModal
          title="FILTER BY COLLECTION"
          items={[
            { label: "ALL TITLES", current: collFilter === null },
            ...collections.map((c) => ({
              label: c.name,
              value: String(c.gameIds.length),
              current: c.id === collFilter,
            })),
          ]}
          selected={collPicker}
          footer="ENTER=FILTER | ESC=CANCEL"
          onItemClick={(i) => {
            setCollFilter(i === 0 ? null : collections[i - 1].id);
            setSel(0);
            setCollPicker(null);
          }}
        />
      )}
    </div>
  );
}
