import * as React from "react";
import "@fontsource/vt323";
import "./retro.css";
import { Titlebar } from "@/components/shared/Titlebar";
import { useGameStore, type Game, type GameStatus } from "@/stores/gameStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { retroPalette, retroThemeById, RETRO_THEMES } from "./palette";
import { RetroModal } from "./RetroModal";
import { RetroToasts } from "./RetroToasts";
import { RetroSessionNote } from "./RetroSessionNote";
import { RetroStats } from "./RetroStats";
import { RetroUpdatePrompt } from "./RetroUpdatePrompt";
import { useUpdateStore } from "@/stores/updateStore";
import { beep } from "./beep";
import { useSessionNoteStore } from "@/stores/sessionNoteStore";
import { RetroLibrary } from "./RetroLibrary";
import { RetroDetail } from "./RetroDetail";
import { RetroSettings } from "./RetroSettings";
import { RetroProcessPicker } from "./RetroProcessPicker";
import { fmtClock } from "./format";

export interface RetroAppProps {
  onExit: () => void;
  onLaunch: (game: Game) => void;
  onStop: () => void;
  onResync: () => void;
  isSyncing: boolean;
  onSetStatus: (gameId: string, status: GameStatus) => void;
  onSetRating: (gameId: string, rating: number | null) => void;
  onProcessSelected: (exeName: string, pid: number) => void;
  onCancelProcessPicker: () => void;
}

type Screen =
  | { name: "library" }
  | { name: "detail"; gameId: string }
  | { name: "settings" }
  | { name: "stats" };

const FKEYS: Record<Screen["name"], { key: string; label: string }[]> = {
  library: [
    { key: "F1", label: "Help" },
    { key: "ENTER", label: "View" },
    { key: "F2", label: "Theme" },
    { key: "F3", label: "Sort" },
    { key: "F4", label: "Coll" },
    { key: "F5", label: "Rescan" },
    { key: "F6", label: "Stats" },
    { key: "F8", label: "Run" },
    { key: "F9", label: "Setup" },
  ],
  detail: [
    { key: "TAB", label: "Section" },
    { key: "ENTER", label: "Open" },
    { key: "F7", label: "Status" },
    { key: "F8", label: "Run/Stop" },
    { key: "ESC", label: "Back" },
  ],
  settings: [
    { key: "ENTER", label: "Toggle" },
    { key: "F2", label: "Theme" },
    { key: "ESC", label: "Back" },
  ],
  stats: [
    { key: "F2", label: "Theme" },
    { key: "ESC", label: "Back" },
  ],
};

export function RetroApp({
  onExit,
  onLaunch,
  onStop,
  onResync,
  isSyncing,
  onSetStatus,
  onSetRating,
  onProcessSelected,
  onCancelProcessPicker,
}: RetroAppProps) {
  const [screen, setScreen] = React.useState<Screen>({ name: "library" });
  const [helpOpen, setHelpOpen] = React.useState(false);
  const activeSession = useGameStore((s) => s.activeSession);
  const showProcessPicker = useGameStore((s) => s.showProcessPicker);
  const gameCount = useGameStore((s) => s.games.length);

  // Retro theme: own preset, independent of the modern theme. "app" preset
  // mirrors the modern accent. F2 opens the picker; arrow moves live-preview.
  const accentColor = useSettingsStore((s) => s.accentColor);
  const retroTheme = useSettingsStore((s) => s.retroTheme);
  const [themePicker, setThemePicker] = React.useState<number | null>(null);

  const themeVars = React.useMemo(() => {
    const def = themePicker != null ? RETRO_THEMES[themePicker] : retroThemeById(retroTheme);
    if (!def.accent) return undefined;
    const pal = retroPalette(def.accent === "app" ? accentColor : def.accent);
    if (!pal) return undefined;
    return {
      "--vga-blue": pal.screen,
      "--vga-cyan": pal.bar,
      "--vga-bcyan": pal.bright,
    } as React.CSSProperties;
  }, [themePicker, retroTheme, accentColor]);

  // PC-speaker key beeps: one listener, independent of the key handlers.
  const soundsEnabled = useSettingsStore((s) => s.retroSounds);
  React.useEffect(() => {
    if (!soundsEnabled) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Enter") beep(1100, 35);
      else if (e.key === "Escape") beep(500, 35);
      else if (/^F\d{1,2}$/.test(e.key)) beep(880, 30);
      else if (e.key.startsWith("Arrow") || e.key === "Tab") beep(700, 15);
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [soundsEnabled]);

  // 1s tick drives the clock and the "now playing" elapsed counter.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const noteQueueLength = useSessionNoteStore((s) => s.queue.length);
  const notePromptEnabled = useSettingsStore((s) => s.sessionNotePromptEnabled);
  const noteOpen = notePromptEnabled && noteQueueLength > 0;

  const updateAvailable = useUpdateStore((s) => s.updateAvailable);
  const updateDismissed = useUpdateStore((s) => s.popupDismissed);
  const updateOpen = updateAvailable && !updateDismissed;

  const keysEnabled = !showProcessPicker && themePicker == null && !noteOpen && !updateOpen && !helpOpen;

  // Screen-global keys. Everything screen-specific lives in the screens.
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (showProcessPicker || noteOpen || updateOpen) return;

      // Help popup: any of Esc/F1/Enter closes it.
      if (helpOpen) {
        if (e.key === "Escape" || e.key === "F1" || e.key === "Enter") {
          e.preventDefault();
          setHelpOpen(false);
        }
        return;
      }

      // Theme picker modal owns the keyboard while open.
      if (themePicker != null) {
        if (e.key === "Escape") { e.preventDefault(); setThemePicker(null); }
        else if (e.key === "ArrowDown") { e.preventDefault(); setThemePicker(Math.min(RETRO_THEMES.length - 1, themePicker + 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setThemePicker(Math.max(0, themePicker - 1)); }
        else if (e.key === "Enter") {
          e.preventDefault();
          useSettingsStore.getState().setRetroTheme(RETRO_THEMES[themePicker].id);
          setThemePicker(null);
        } else {
          const idx = "ABCDEFGHI".indexOf(e.key.toUpperCase());
          if (idx >= 0 && idx < RETRO_THEMES.length) {
            e.preventDefault();
            useSettingsStore.getState().setRetroTheme(RETRO_THEMES[idx].id);
            setThemePicker(null);
          }
        }
        return;
      }

      if (e.key === "F9") {
        e.preventDefault();
        setScreen((s) => (s.name === "settings" ? { name: "library" } : { name: "settings" }));
      } else if (e.key === "F5") {
        e.preventDefault();
        if (!isSyncing) onResync();
      } else if (e.key === "F2") {
        e.preventDefault();
        setThemePicker(Math.max(0, RETRO_THEMES.findIndex((t) => t.id === useSettingsStore.getState().retroTheme)));
      } else if (e.key === "F6") {
        e.preventDefault();
        setScreen((s) => (s.name === "stats" ? { name: "library" } : { name: "stats" }));
      } else if (e.key === "F1") {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [showProcessPicker, noteOpen, updateOpen, helpOpen, themePicker, isSyncing, onResync]);

  const elapsedS = activeSession
    ? Math.floor((now - new Date(activeSession.startedAt).getTime()) / 1000)
    : 0;

  const d = new Date(now);
  const dateStr = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${String(d.getFullYear() % 100).padStart(2, "0")}`;
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }} data-testid="retro-app">
      <Titlebar />
      <div className="retro-root" style={{ flex: 1, minHeight: 0, ...themeVars }}>
        <div className="retro-titlebar">
          <span>NEXUS TR5 - GAME LIBRARY/LAUNCH/TRACK/SETUP</span>
          <span>{dateStr} {timeStr}</span>
        </div>

        <div className="retro-screen">
          {screen.name === "library" && (
            <RetroLibrary
              enabled={keysEnabled}
              onOpenDetail={(g) => setScreen({ name: "detail", gameId: g.id })}
              onLaunch={onLaunch}
            />
          )}
          {screen.name === "detail" && (
            <RetroDetail
              gameId={screen.gameId}
              enabled={keysEnabled}
              onBack={() => setScreen({ name: "library" })}
              onLaunch={onLaunch}
              onStop={onStop}
              onSetStatus={onSetStatus}
              onSetRating={onSetRating}
            />
          )}
          {screen.name === "settings" && (
            <RetroSettings
              enabled={keysEnabled}
              onBack={() => setScreen({ name: "library" })}
              onExit={onExit}
            />
          )}
          {screen.name === "stats" && (
            <RetroStats
              enabled={keysEnabled}
              onBack={() => setScreen({ name: "library" })}
            />
          )}
        </div>

        <div className="retro-statusline">
          <span data-testid="retro-status-left">
            {isSyncing ? "SCANNING SOURCES..." : `READY - ${gameCount} TITLES ON FILE`}
          </span>
          <span data-testid="retro-status-right">
            {activeSession ? (
              <>
                RUN: {activeSession.gameName} {fmtClock(elapsedS)}
                {!activeSession.processDetected && " (NO PROCESS)"}
              </>
            ) : (
              "NO GAME RUNNING"
            )}
          </span>
        </div>

        <div className="retro-fkey-bar">
          {FKEYS[screen.name].map((f) => (
            <span key={f.key}>
              <b>{f.key}</b> {f.label}
            </span>
          ))}
        </div>

        <div className="retro-scanlines" />

        {helpOpen && (
          <RetroModal title="HELP - KEY REFERENCE" footer="ESC=CLOSE">
            <div data-testid="retro-help">
              {[
                ["GLOBAL", ""],
                ["F1", "THIS HELP"],
                ["F2", "THEME PICKER"],
                ["F5", "RESCAN SOURCES"],
                ["F6", "LIBRARY STATISTICS"],
                ["F9", "SETUP / EXIT RETRO"],
                ["", ""],
                ["LIBRARY", ""],
                ["TYPE", "FIND TITLE"],
                ["ARROWS", "MOVE SELECTION"],
                ["ENTER", "VIEW TITLE"],
                ["F3", "CYCLE SORT"],
                ["F4", "FILTER BY COLLECTION"],
                ["F8", "RUN SELECTED TITLE"],
                ["", ""],
                ["TITLE VIEW", ""],
                ["TAB", "NEXT SECTION"],
                ["ENTER", "OPEN FIELD / SESSION"],
                ["F7", "SET STATUS"],
                ["+ / -", "RATE"],
                ["F8", "RUN / STOP"],
                ["ESC", "BACK / CLOSE POPUP"],
              ].map(([k, desc], i) =>
                desc === "" ? (
                  <div key={i} className="retro-row" style={{ padding: 0 }}>
                    <span style={{ textDecoration: k ? "underline" : "none" }}>{k || " "}</span>
                  </div>
                ) : (
                  <div key={i} className="retro-row" style={{ padding: 0 }}>
                    <span style={{ width: "12ch" }}>{k}</span>
                    <span>{desc}</span>
                  </div>
                ),
              )}
            </div>
          </RetroModal>
        )}

        {themePicker != null && (
          <RetroModal
            title="SELECT THEME"
            items={RETRO_THEMES.map((t, i) => ({
              label: t.label,
              hotkey: "ABCDEFGHI"[i],
              current: t.id === retroTheme,
            }))}
            selected={themePicker}
            footer="A-I/ENTER=SET | ESC=CANCEL"
            onItemClick={(i) => {
              useSettingsStore.getState().setRetroTheme(RETRO_THEMES[i].id);
              setThemePicker(null);
            }}
          />
        )}

        {showProcessPicker && (
          <RetroProcessPicker
            gameName={activeSession?.gameName ?? ""}
            onProcessSelected={onProcessSelected}
            onCancel={onCancelProcessPicker}
          />
        )}

        <RetroToasts />
        <RetroSessionNote />
        <RetroUpdatePrompt />
      </div>
    </div>
  );
}
