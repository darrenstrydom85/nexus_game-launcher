import * as React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { StreamEmbed } from "./StreamEmbed";

/**
 * Frameless, always-on-top window mounted at `/popout-player` (Story A1).
 *
 * The pop-out URL carries everything needed to start a watch session
 * (`channel`, `display`, `gameId`, `gameName`) so this view never has to invoke
 * a Twitch API call — the iframe handles its own data load.
 *
 * Closing the window via the in-embed close button calls
 * `getCurrentWindow().close()`. The Rust `on_window_event` handler short-circuits
 * for any window whose label is not `"main"`, so the close-to-tray confirmation
 * dialog never fires here and the window closes cleanly.
 *
 * Dragging: because the window is built with `decorations(false)` (no native
 * title bar), the StreamEmbed header is marked as a Tauri drag region via
 * `draggableHeader` so the user can move the window by grabbing it.
 */
export function PopoutPlayer() {
  const params = React.useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const channel = params.get("channel") ?? "";
  const display = params.get("display") ?? channel;
  const gameId = params.get("gameId");
  const gameName = params.get("gameName");

  const handleClose = React.useCallback(() => {
    void getCurrentWindow().close().catch(() => {});
  }, []);

  if (!channel) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Pop-out player: missing channel.
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-black">
      <StreamEmbed
        channelLogin={channel}
        channelDisplayName={display}
        twitchGameId={gameId}
        twitchGameName={gameName}
        defaultChatVisible={false}
        hidePopOut
        draggableHeader
        onClose={handleClose}
      />
    </div>
  );
}
