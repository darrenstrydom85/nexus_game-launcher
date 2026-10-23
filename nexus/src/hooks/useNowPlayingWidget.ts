import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTauriEvent } from "./use-tauri-event";
import { useGameStore, type ActiveSession } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { WIDGET_EVENTS, type WidgetSession } from "@/components/shared/NowPlayingWidget";

function sendSession(session: ActiveSession) {
  const payload: WidgetSession = {
    gameName: session.gameName,
    coverUrl: session.coverUrl,
    startedAt: session.startedAt,
    launching: !session.processDetected,
  };
  emit(WIDGET_EVENTS.session, payload).catch(() => {});
}

/**
 * Main-window side of the now-playing desktop widget: opens it while a game
 * runs and Nexus is minimized or in the tray, keeps it fed, and handles its clicks.
 */
export function useNowPlayingWidget(onStop: () => void) {
  const session = useGameStore((s) => s.activeSession);
  const [away, setAway] = React.useState(false);
  // The widget's close button hides it for the rest of that game session.
  const [dismissedId, setDismissedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const win = getCurrentWindow();
    // A tray hide fires no resize, but the window loses focus as it goes.
    const check = async () => setAway((await win.isMinimized()) || !(await win.isVisible()));
    const unlisteners = [win.onResized(check), win.onFocusChanged(check)];
    return () => unlisteners.forEach((p) => p.then((off) => off()));
  }, []);

  const open = session !== null && away && dismissedId !== session.sessionId;
  React.useEffect(() => {
    invoke("set_now_playing_widget", { open }).catch(() => {});
  }, [open]);
  React.useEffect(() => {
    if (open && session) sendSession(session);
  }, [open, session]);

  const onReady = React.useCallback(() => {
    const current = useGameStore.getState().activeSession;
    if (current) sendSession(current);
  }, []);
  const onOpen = React.useCallback(() => {
    const current = useGameStore.getState().activeSession;
    invoke("show_main_window").catch(() => {});
    if (current) useUiStore.getState().setDetailOverlayGameId(current.gameId);
  }, []);
  const onDismiss = React.useCallback(() => {
    setDismissedId(useGameStore.getState().activeSession?.sessionId ?? null);
  }, []);

  useTauriEvent(WIDGET_EVENTS.ready, onReady);
  useTauriEvent(WIDGET_EVENTS.open, onOpen);
  useTauriEvent(WIDGET_EVENTS.stop, onStop);
  useTauriEvent(WIDGET_EVENTS.dismiss, onDismiss);
}
