import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGameStore, refreshGames, type Game, type GameStatus } from "@/stores/gameStore";
import { usePerGameSessionStats } from "@/hooks/usePerGameSessionStats";
import { useToastStore } from "@/stores/toastStore";
import { searchMetadata, fetchMetadataWithIgdbId, type MetadataSearchResult } from "@/lib/tauri";
import type { SessionRecord } from "@/types/analytics";
import { RetroModal } from "./RetroModal";
import { SOURCE_CODE, STATUS_CODE, STATUS_CYCLE, fmtHours, fmtDate, fmtDur, fmtStars } from "./format";

export interface RetroDetailProps {
  gameId: string;
  enabled: boolean;
  onBack: () => void;
  onLaunch: (game: Game) => void;
  onStop: () => void;
  onSetStatus: (gameId: string, status: GameStatus) => void;
  onSetRating: (gameId: string, rating: number | null) => void;
}

type Section = "info" | "meta" | "desc" | "sessions";

type Modal =
  | { type: "status"; sel: number }
  | { type: "rating"; sel: number }
  | { type: "session"; session: SessionRecord }
  | { type: "edit" }
  | { type: "meta" };

interface FieldRow {
  label: string;
  value: React.ReactNode;
  /** Enter on this row opens a modal. */
  action?: "status" | "rating";
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const RATING_ITEMS = [
  { label: "CLEAR RATING", value: ".....", hotkey: "0" },
  ...[1, 2, 3, 4, 5].map((r) => ({ label: `RATE ${r}`, value: fmtStars(r), hotkey: String(r) })),
];

export function RetroDetail({ gameId, enabled, onBack, onLaunch, onStop, onSetStatus, onSetRating }: RetroDetailProps) {
  const game = useGameStore((s) => s.games.find((g) => g.id === gameId));
  const activeSession = useGameStore((s) => s.activeSession);
  const { stats, isLoading, fetch } = usePerGameSessionStats(gameId);

  const [section, setSection] = React.useState<Section>("info");
  const [rowSel, setRowSel] = React.useState(0);
  const [sessSel, setSessSel] = React.useState(0);
  const [modal, setModal] = React.useState<Modal | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editExe, setEditExe] = React.useState("");
  const descRef = React.useRef<HTMLDivElement>(null);
  const sessListRef = React.useRef<HTMLDivElement>(null);
  const editNameRef = React.useRef<HTMLInputElement>(null);
  const editExeRef = React.useRef<HTMLInputElement>(null);

  const openEdit = React.useCallback((g: Game) => {
    setEditName(g.name);
    setEditExe(g.exePath ?? "");
    setModal({ type: "edit" });
  }, []);

  const [metaQuery, setMetaQuery] = React.useState("");
  const [metaResults, setMetaResults] = React.useState<MetadataSearchResult[]>([]);
  const [metaSel, setMetaSel] = React.useState(0);
  const [metaBusy, setMetaBusy] = React.useState(false);
  const [metaError, setMetaError] = React.useState<string | null>(null);
  const metaInputRef = React.useRef<HTMLInputElement>(null);

  const openMeta = React.useCallback((g: Game) => {
    setMetaQuery(g.name);
    setMetaResults([]);
    setMetaSel(0);
    setMetaError(null);
    setModal({ type: "meta" });
  }, []);

  const runMetaSearch = React.useCallback(async () => {
    const q = metaQuery.trim();
    if (!q) return;
    setMetaBusy(true);
    setMetaError(null);
    try {
      const list = await searchMetadata(q);
      setMetaResults(list);
      setMetaSel(0);
      if (list.length === 0) setMetaError("NO RESULTS - TRY ANOTHER QUERY");
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : "SEARCH FAILED");
      setMetaResults([]);
    } finally {
      setMetaBusy(false);
    }
  }, [metaQuery]);

  const applyMeta = React.useCallback(
    async (item: MetadataSearchResult) => {
      setMetaBusy(true);
      setMetaError(null);
      try {
        await fetchMetadataWithIgdbId(gameId, item.id, true);
        await refreshGames();
        useToastStore.getState().addToast({ type: "success", message: `Metadata applied: ${item.name}` });
        setModal(null);
      } catch (err) {
        setMetaError(err instanceof Error ? err.message : "FAILED TO APPLY METADATA");
      } finally {
        setMetaBusy(false);
      }
    },
    [gameId],
  );

  const refetchMeta = React.useCallback(
    async (g: Game) => {
      const toastId = useToastStore.getState().addToast({
        type: "info",
        message: `Refetching metadata for ${g.name}...`,
        duration: 0,
      });
      try {
        await invoke("fetch_metadata", { gameId: g.id });
        await refreshGames();
        useToastStore.getState().removeToast(toastId);
        useToastStore.getState().addToast({ type: "success", message: `Metadata refreshed: ${g.name}` });
      } catch {
        useToastStore.getState().removeToast(toastId);
        useToastStore.getState().addToast({ type: "error", message: `Metadata refetch failed: ${g.name}` });
      }
    },
    [],
  );

  const saveEdit = React.useCallback(async () => {
    const name = editName.trim();
    if (!name) return;
    try {
      await invoke("update_game", {
        id: gameId,
        fields: { name, exePath: editExe.trim() || null },
      });
      await refreshGames();
    } catch {
      // best-effort, matches modern EditGameModal
    }
    setModal(null);
  }, [gameId, editName, editExe]);

  React.useEffect(() => {
    fetch();
  }, [fetch]);

  React.useEffect(() => {
    if (!game) onBack();
  }, [game, onBack]);

  const isPlaying = activeSession?.gameId === gameId;
  const sessions = React.useMemo(() => stats?.sessions ?? [], [stats]);

  const infoRows = React.useMemo<FieldRow[]>(() => {
    if (!game) return [];
    return [
      { label: "SOURCE", value: SOURCE_CODE[game.source] },
      { label: "STATUS", value: STATUS_CODE[game.status], action: "status" },
      { label: "RATING", value: <span className="retro-accent">{fmtStars(game.rating)}</span>, action: "rating" },
      { label: "HOURS", value: fmtHours(game.totalPlayTimeS) },
      { label: "SESSIONS", value: String(game.playCount) },
      { label: "LAST RUN", value: fmtDate(game.lastPlayedAt) },
    ];
  }, [game]);

  const metaRows = React.useMemo<FieldRow[]>(() => {
    if (!game) return [];
    const hltb = [
      game.hltbMainH != null ? `MAIN ${game.hltbMainH}H` : null,
      game.hltbMainExtraH != null ? `EXTRA ${game.hltbMainExtraH}H` : null,
      game.hltbCompletionistH != null ? `100% ${game.hltbCompletionistH}H` : null,
    ].filter(Boolean).join("  ");
    return [
      { label: "RELEASED", value: fmtDate(game.releaseDate) },
      { label: "ADDED", value: fmtDate(game.addedAt) },
      { label: "GENRES", value: game.genres.length ? game.genres.join(", ") : "-" },
      { label: "CRITIC", value: game.criticScore != null ? `${Math.round(game.criticScore)}/100` : "-" },
      { label: "USERS", value: game.communityScore != null ? `${Math.round(game.communityScore)}/100` : "-" },
      { label: "HLTB", value: hltb || "-" },
      { label: "EXE", value: game.exeName ?? "-" },
    ];
  }, [game]);

  const sections = React.useMemo<Section[]>(() => {
    const s: Section[] = ["info", "meta"];
    if (game?.description) s.push("desc");
    s.push("sessions");
    return s;
  }, [game?.description]);

  const cycleSection = React.useCallback(
    (dir: 1 | -1) => {
      setSection((cur) => {
        const idx = sections.indexOf(cur);
        return sections[(idx + dir + sections.length) % sections.length];
      });
      setRowSel(0);
    },
    [sections],
  );

  const openStatusModal = React.useCallback(() => {
    if (!game) return;
    setModal({ type: "status", sel: Math.max(0, STATUS_CYCLE.indexOf(game.status)) });
  }, [game]);

  const scrollSession = React.useCallback((idx: number) => {
    sessListRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${idx}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, []);

  React.useEffect(() => {
    if (!enabled || !game) return;
    const h = (e: KeyboardEvent) => {
      // While a pseudo-modal is open it owns the keyboard.
      if (modal) {
        switch (modal.type) {
          case "status": {
            if (e.key === "Escape") { e.preventDefault(); setModal(null); }
            else if (e.key === "ArrowDown") { e.preventDefault(); setModal({ ...modal, sel: Math.min(STATUS_CYCLE.length - 1, modal.sel + 1) }); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setModal({ ...modal, sel: Math.max(0, modal.sel - 1) }); }
            else if (e.key === "Enter") { e.preventDefault(); onSetStatus(gameId, STATUS_CYCLE[modal.sel]); setModal(null); }
            else {
              const idx = "ABCDEF".indexOf(e.key.toUpperCase());
              if (idx >= 0 && idx < STATUS_CYCLE.length) {
                e.preventDefault();
                onSetStatus(gameId, STATUS_CYCLE[idx]);
                setModal(null);
              }
            }
            break;
          }
          case "rating": {
            if (e.key === "Escape") { e.preventDefault(); setModal(null); }
            else if (e.key === "ArrowDown") { e.preventDefault(); setModal({ ...modal, sel: Math.min(RATING_ITEMS.length - 1, modal.sel + 1) }); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setModal({ ...modal, sel: Math.max(0, modal.sel - 1) }); }
            else if (e.key === "Enter") { e.preventDefault(); onSetRating(gameId, modal.sel === 0 ? null : modal.sel); setModal(null); }
            else if (/^[0-5]$/.test(e.key)) {
              e.preventDefault();
              const n = Number(e.key);
              onSetRating(gameId, n === 0 ? null : n);
              setModal(null);
            }
            break;
          }
          case "session": {
            if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); setModal(null); }
            break;
          }
          case "edit": {
            if (e.key === "Escape") { e.preventDefault(); setModal(null); }
            else if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
            else if (e.key === "Tab") {
              e.preventDefault();
              if (document.activeElement === editNameRef.current) editExeRef.current?.focus();
              else editNameRef.current?.focus();
            }
            break;
          }
          case "meta": {
            if (e.key === "Escape") { e.preventDefault(); if (!metaBusy) setModal(null); }
            else if (metaBusy) { /* ignore keys while a request is in flight */ }
            else if (e.key === "ArrowDown") { e.preventDefault(); setMetaSel((s) => Math.min(metaResults.length - 1, s + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setMetaSel((s) => Math.max(0, s - 1)); }
            else if (e.key === "Enter") {
              e.preventDefault();
              if (metaResults.length > 0 && metaResults[metaSel]) applyMeta(metaResults[metaSel]);
              else runMetaSearch();
            }
            break;
          }
        }
        return;
      }

      switch (e.key) {
        case "Tab":
          e.preventDefault();
          cycleSection(e.shiftKey ? -1 : 1);
          break;
        case "Escape":
          e.preventDefault();
          onBack();
          break;
        case "F8":
          e.preventDefault();
          if (isPlaying) onStop();
          else onLaunch(game);
          break;
        case "F7":
          e.preventDefault();
          openStatusModal();
          break;
        case "e":
        case "E":
          e.preventDefault();
          openEdit(game);
          break;
        case "m":
        case "M":
          e.preventDefault();
          openMeta(game);
          break;
        case "r":
        case "R":
          e.preventDefault();
          refetchMeta(game);
          break;
        case "+":
        case "=":
          e.preventDefault();
          onSetRating(gameId, Math.min(5, (game.rating ?? 0) + 1));
          break;
        case "-": {
          e.preventDefault();
          const cur = game.rating ?? 0;
          onSetRating(gameId, cur <= 1 ? null : cur - 1);
          break;
        }
        case "ArrowDown":
        case "ArrowUp": {
          e.preventDefault();
          const dir = e.key === "ArrowDown" ? 1 : -1;
          if (section === "info") setRowSel((s) => Math.max(0, Math.min(infoRows.length - 1, s + dir)));
          else if (section === "meta") setRowSel((s) => Math.max(0, Math.min(metaRows.length - 1, s + dir)));
          else if (section === "desc") descRef.current?.scrollBy?.(0, dir * 22);
          else if (section === "sessions") {
            setSessSel((s) => {
              const next = Math.max(0, Math.min(sessions.length - 1, s + dir));
              scrollSession(next);
              return next;
            });
          }
          break;
        }
        case "PageDown":
        case "PageUp": {
          if (section !== "sessions") break;
          e.preventDefault();
          const jump = e.key === "PageDown" ? 10 : -10;
          setSessSel((s) => {
            const next = Math.max(0, Math.min(sessions.length - 1, s + jump));
            scrollSession(next);
            return next;
          });
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (section === "info" || section === "meta") {
            const rows = section === "info" ? infoRows : metaRows;
            const action = rows[rowSel]?.action;
            if (action === "status") openStatusModal();
            else if (action === "rating") setModal({ type: "rating", sel: game.rating ?? 0 });
          } else if (section === "sessions" && sessions[sessSel]) {
            setModal({ type: "session", session: sessions[sessSel] });
          }
          break;
        }
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [
    enabled, game, gameId, modal, section, rowSel, sessSel, sessions,
    infoRows, metaRows, isPlaying, cycleSection, openStatusModal, openEdit, saveEdit, scrollSession,
    openMeta, refetchMeta, runMetaSearch, applyMeta, metaBusy, metaResults, metaSel,
    onBack, onLaunch, onStop, onSetStatus, onSetRating,
  ]);

  if (!game) return null;

  const panelClass = (s: Section) =>
    section === s ? "retro-panel retro-panel-focused" : "retro-panel";

  const renderFieldPanel = (s: "info" | "meta", title: string, rows: FieldRow[]) => (
    <div
      className={panelClass(s)}
      style={{ flex: 1 }}
      data-testid={`retro-detail-${s}`}
      onMouseDown={() => { setSection(s); setRowSel(0); }}
    >
      <div className="retro-panel-header">
        <span>{title}</span>
        <span>{section === s ? "[TAB]" : ""}</span>
      </div>
      {rows.map((row, i) => {
        const focused = section === s && rowSel === i;
        return (
          <div
            key={row.label}
            className={focused ? "retro-row retro-row-selected" : "retro-row"}
            style={{ padding: 0 }}
            onMouseDown={(e) => { e.stopPropagation(); setSection(s); setRowSel(i); }}
            onDoubleClick={() => {
              if (row.action === "status") openStatusModal();
              else if (row.action === "rating") setModal({ type: "rating", sel: game.rating ?? 0 });
            }}
          >
            <span className="retro-label" style={{ width: "12ch" }}>{row.label}</span>
            <span className="retro-value" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
              {row.value}
            </span>
            <span style={{ width: "8ch", textAlign: "right" }}>
              {focused && row.action ? "<ENTER>" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: 4 }} data-testid="retro-detail">
      <div className="retro-panel">
        <div className="retro-panel-title">
          {game.name}
          {isPlaying && <span className="retro-good retro-blink">&nbsp;** RUNNING **</span>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {renderFieldPanel("info", "INFO", infoRows)}
        {renderFieldPanel("meta", "META", metaRows)}
      </div>

      {game.description && (
        <div
          className={panelClass("desc")}
          style={{ flexShrink: 0 }}
          data-testid="retro-detail-desc"
          onMouseDown={() => setSection("desc")}
        >
          <div className="retro-panel-header">
            <span>DESCRIPTION</span>
            <span>{section === "desc" ? "[ARROWS SCROLL]" : ""}</span>
          </div>
          <div ref={descRef} className="retro-scroll" style={{ maxHeight: "5em" }}>
            <span className="retro-dim">{game.description}</span>
          </div>
        </div>
      )}

      <div
        className={panelClass("sessions")}
        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
        data-testid="retro-detail-sessions"
        onMouseDown={() => setSection("sessions")}
      >
        <div className="retro-panel-header">
          <span>PLAY SESSIONS{stats ? ` (${sessions.length})` : ""}</span>
          <span>{section === "sessions" ? "[ENTER=VIEW]" : ""}</span>
        </div>
        <div className="retro-th">
          <span style={{ width: "11ch" }}>DATE</span>
          <span style={{ width: "8ch" }}>START</span>
          <span style={{ width: "10ch" }}>LENGTH</span>
          <span style={{ width: "10ch" }}>METHOD</span>
          <span style={{ flex: 1 }}>NOTE</span>
        </div>
        <div ref={sessListRef} className="retro-scroll" style={{ flex: 1, minHeight: 0 }}>
          {isLoading ? (
            <div className="retro-row retro-dim">READING SESSION FILE...</div>
          ) : sessions.length === 0 ? (
            <div className="retro-row retro-dim">NO SESSIONS ON FILE</div>
          ) : (
            sessions.map((s, i) => {
              const focused = section === "sessions" && sessSel === i;
              return (
                <div
                  key={s.id}
                  data-idx={i}
                  data-testid={`retro-session-row-${i}`}
                  className={focused ? "retro-row retro-row-selected" : "retro-row"}
                  onMouseDown={() => { setSection("sessions"); setSessSel(i); }}
                  onDoubleClick={() => setModal({ type: "session", session: s })}
                >
                  <span style={{ width: "11ch" }}>{fmtDate(s.startedAt)}</span>
                  <span style={{ width: "8ch" }}>{fmtTime(s.startedAt)}</span>
                  <span style={{ width: "10ch" }}>{fmtDur(s.durationS)}</span>
                  <span style={{ width: "10ch" }}>{s.trackingMethod}</span>
                  <span className="retro-dim" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {s.note ?? ""}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {modal?.type === "status" && (
        <RetroModal
          title="SET STATUS"
          items={STATUS_CYCLE.map((st, i) => ({
            label: STATUS_CODE[st],
            hotkey: "ABCDEF"[i],
            current: game.status === st,
          }))}
          selected={modal.sel}
          footer="A-F/ENTER=SET | ESC=CANCEL"
          onItemClick={(i) => { onSetStatus(gameId, STATUS_CYCLE[i]); setModal(null); }}
        />
      )}

      {modal?.type === "rating" && (
        <RetroModal
          title="RATE TITLE"
          items={RATING_ITEMS}
          selected={modal.sel}
          footer="0-5/ENTER=SET | ESC=CANCEL"
          onItemClick={(i) => { onSetRating(gameId, i === 0 ? null : i); setModal(null); }}
        />
      )}

      {modal?.type === "edit" && (
        <RetroModal title="EDIT TITLE" footer="TAB=FIELD | ENTER=SAVE | ESC=CANCEL">
          <div data-testid="retro-edit" style={{ minWidth: "50ch" }}>
            <div style={{ display: "flex" }}>
              <span style={{ width: "10ch" }}>NAME :</span>
              <input
                ref={editNameRef}
                data-testid="retro-edit-name"
                className="retro-input"
                style={{ flex: 1 }}
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                aria-label="Game name"
              />
            </div>
            <div style={{ display: "flex", marginTop: 4 }}>
              <span style={{ width: "10ch" }}>EXE :</span>
              <input
                ref={editExeRef}
                data-testid="retro-edit-exe"
                className="retro-input"
                style={{ flex: 1, textTransform: "none" }}
                value={editExe}
                onChange={(e) => setEditExe(e.target.value)}
                aria-label="Executable path"
              />
            </div>
          </div>
        </RetroModal>
      )}

      {modal?.type === "meta" && (
        <RetroModal
          title="SEARCH METADATA (IGDB)"
          footer={metaResults.length > 0 ? "ARROWS=SELECT | ENTER=APPLY | ESC=CANCEL" : "ENTER=SEARCH | ESC=CANCEL"}
        >
          <div data-testid="retro-meta" style={{ minWidth: "52ch" }}>
            <div style={{ display: "flex" }}>
              <span style={{ width: "8ch" }}>FIND :</span>
              <input
                ref={metaInputRef}
                data-testid="retro-meta-input"
                className="retro-input"
                style={{ flex: 1 }}
                autoFocus
                value={metaQuery}
                onChange={(e) => {
                  setMetaQuery(e.target.value);
                  setMetaResults([]);
                  setMetaError(null);
                }}
                onBlur={() => { if (modal?.type === "meta") metaInputRef.current?.focus(); }}
                aria-label="Metadata search query"
              />
            </div>
            <div style={{ borderTop: "1px solid #000", margin: "2px 0" }} />
            {metaBusy ? (
              <div className="retro-blink">WORKING...</div>
            ) : metaError ? (
              <div data-testid="retro-meta-error">{metaError}</div>
            ) : metaResults.length === 0 ? (
              <div>TYPE QUERY, PRESS ENTER TO SEARCH</div>
            ) : (
              <div className="retro-scroll" style={{ maxHeight: "12em" }}>
                {metaResults.map((item, i) => (
                  <div
                    key={item.id}
                    data-testid={`retro-meta-result-${i}`}
                    className={i === metaSel ? "retro-row retro-row-selected" : "retro-row"}
                    style={{ padding: 0 }}
                    onMouseDown={() => setMetaSel(i)}
                    onDoubleClick={() => applyMeta(item)}
                  >
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</span>
                    <span style={{ width: "6ch", textAlign: "right" }}>
                      {item.releaseDate != null ? new Date(item.releaseDate * 1000).getFullYear() : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </RetroModal>
      )}

      {modal?.type === "session" && (
        <RetroModal title="SESSION DETAIL" footer="ESC=CLOSE">
          <div className="retro-row" style={{ padding: 0 }}>
            <span style={{ width: "10ch" }}>DATE</span>
            <span>{fmtDate(modal.session.startedAt)}</span>
          </div>
          <div className="retro-row" style={{ padding: 0 }}>
            <span style={{ width: "10ch" }}>START</span>
            <span>{fmtTime(modal.session.startedAt)}</span>
          </div>
          <div className="retro-row" style={{ padding: 0 }}>
            <span style={{ width: "10ch" }}>END</span>
            <span>{fmtTime(modal.session.endedAt)}</span>
          </div>
          <div className="retro-row" style={{ padding: 0 }}>
            <span style={{ width: "10ch" }}>LENGTH</span>
            <span>{fmtDur(modal.session.durationS)}</span>
          </div>
          <div className="retro-row" style={{ padding: 0 }}>
            <span style={{ width: "10ch" }}>METHOD</span>
            <span>{modal.session.trackingMethod}</span>
          </div>
          <div style={{ borderTop: "1px solid #000", margin: "2px 0" }} />
          <div style={{ whiteSpace: "pre-wrap", maxHeight: "10em", overflowY: "auto" }}>
            {modal.session.note ?? "NO NOTE"}
          </div>
        </RetroModal>
      )}
    </div>
  );
}
