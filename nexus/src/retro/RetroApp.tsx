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
import { RetroBoot } from "./RetroBoot";
import { RetroScreensaver } from "./RetroScreensaver";
import { buildLaunchErrorInfo } from "@/lib/launch-errors";
import type { LaunchResult } from "@/lib/launcher";
import { useSessionNoteStore } from "@/stores/sessionNoteStore";
import { RetroLibrary } from "./RetroLibrary";
import { RetroDetail } from "./RetroDetail";
import { RetroSettings } from "./RetroSettings";
import { RetroProcessPicker } from "./RetroProcessPicker";
import { fmtClock } from "./format";

export interface RetroAppProps {
  onExit: () => void;
  /** Raw launch from useLaunchLifecycle — RetroApp surfaces failures itself. */
  onLaunch: (game: Game) => Promise<LaunchResult> | void;
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
  const [booted, setBooted] = React.useState(false);
  const [saverActive, setSaverActive] = React.useState(false);
  const [launchError, setLaunchError] = React.useState<{ game: Game; message: string } | null>(null);
  const retroCrt = useSettingsStore((s) => s.retroCrt);

  // Launch failures surface as an authentic DOS critical-error prompt
  // instead of a toast (the modern toast wrapper is bypassed in retro).
  const handleLaunch = React.useCallback(
    async (game: Game) => {
      const result = await onLaunch(game);
      if (result && result.status === "failed" && result.error) {
        const info = buildLaunchErrorInfo(result.error, game.name);
        if (useSettingsStore.getState().retroSounds) beep(200, 150);
        setLaunchError({ game, message: info.message });
      }
    },
    [onLaunch],
  );
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

  const keysEnabled =
    booted && !saverActive && !showProcessPicker && themePicker == null &&
    !noteOpen && !updateOpen && !helpOpen && launchError == null;

  // Screensaver: 5 min idle -> bouncing logo; any input wakes (and is swallowed).
  const lastActivityRef = React.useRef(Date.now());
  React.useEffect(() => {
    const touch = () => { lastActivityRef.current = Date.now(); };
    document.addEventListener("keydown", touch);
    document.addEventListener("mousemove", touch);
    document.addEventListener("mousedown", touch);
    const id = setInterval(() => {
      if (Date.now() - lastActivityRef.current > 5 * 60 * 1000) setSaverActive(true);
    }, 10_000);
    return () => {
      document.removeEventListener("keydown", touch);
      document.removeEventListener("mousemove", touch);
      document.removeEventListener("mousedown", touch);
      clearInterval(id);
    };
  }, []);
  React.useEffect(() => {
    if (!saverActive) return;
    const wake = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      lastActivityRef.current = Date.now();
      setSaverActive(false);
    };
    document.addEventListener("keydown", wake, true);
    document.addEventListener("mousedown", wake, true);
    document.addEventListener("mousemove", wake, true);
    return () => {
      document.removeEventListener("keydown", wake, true);
      document.removeEventListener("mousedown", wake, true);
      document.removeEventListener("mousemove", wake, true);
    };
  }, [saverActive]);

  // Screen-global keys. Everything screen-specific lives in the screens.
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (showProcessPicker || noteOpen || updateOpen) return;

      // Abort, Retry, Fail? prompt owns the keyboard while open.
      if (launchError) {
        const key = e.key.toLowerCase();
        if (key === "a" || e.key === "Escape" || key === "f") {
          e.preventDefault();
          setLaunchError(null);
        } else if (key === "r") {
          e.preventDefault();
          const { game } = launchError;
          setLaunchError(null);
          handleLaunch(game);
        }
        return;
      }

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
  }, [showProcessPicker, noteOpen, updateOpen, helpOpen, launchError, handleLaunch, themePicker, isSyncing, onResync]);

  const elapsedS = activeSession
    ? Math.floor((now - new Date(activeSession.startedAt).getTime()) / 1000)
    : 0;

  const d = new Date(now);
  const dateStr = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${String(d.getFullYear() % 100).padStart(2, "0")}`;
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }} data-testid="retro-app">
      <Titlebar />
      <div className={retroCrt ? "retro-root retro-crt" : "retro-root"} style={{ flex: 1, minHeight: 0, ...themeVars }}>
        <div className="retro-titlebar">
          <span>NEXUS TR5 - GAME LIBRARY/LAUNCH/TRACK/SETUP</span>
          <span>{dateStr} {timeStr}</span>
        </div>

        <div className="retro-screen">
          {!booted && <RetroBoot onDone={() => setBooted(true)} />}
          {booted && screen.name === "library" && (
            <RetroLibrary
              enabled={keysEnabled}
              onOpenDetail={(g) => setScreen({ name: "detail", gameId: g.id })}
              onLaunch={handleLaunch}
            />
          )}
          {booted && screen.name === "detail" && (
            <RetroDetail
              gameId={screen.gameId}
              enabled={keysEnabled}
              onBack={() => setScreen({ name: "library" })}
              onLaunch={handleLaunch}
              onStop={onStop}
              onSetStatus={onSetStatus}
              onSetRating={onSetRating}
            />
          )}
          {booted && screen.name === "settings" && (
            <RetroSettings
              enabled={keysEnabled}
              onBack={() => setScreen({ name: "library" })}
              onExit={onExit}
            />
          )}
          {booted && screen.name === "stats" && (
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

        {launchError && (
          <RetroModal title="SYSTEM ERROR" footer={<span className="retro-blink">ABORT, RETRY, FAIL?</span>}>
            <div data-testid="retro-launch-error">
              <div>CANNOT RUN: {launchError.game.name}</div>
              <div style={{ margin: "4px 0" }}>{launchError.message}</div>
            </div>
          </RetroModal>
        )}

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
        {saverActive && <RetroScreensaver />}
      </div>
    </div>
  );
}
