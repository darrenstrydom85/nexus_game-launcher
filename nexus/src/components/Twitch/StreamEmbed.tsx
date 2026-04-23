import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ExternalLink,
  LogIn,
  MessageSquare,
  MessageSquareOff,
  PictureInPicture2,
  X,
} from "lucide-react";
import { useWatchSession } from "@/hooks/useWatchSession";

/**
 * Twitch player parent domain. Tauri 2 webviews are served from `tauri.localhost`
 * on Windows (the build the project targets); we list `localhost` as a fallback so
 * the embed still works in `tauri dev` and on platforms whose webview origin
 * differs. Twitch embeds accept multiple `parent=` parameters.
 */
const EMBED_PARENTS = ["tauri.localhost", "localhost"];

function buildPlayerUrl(channel: string, muted: boolean): string {
  const parents = EMBED_PARENTS.map((p) => `parent=${encodeURIComponent(p)}`).join("&");
  return `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&${parents}&muted=${muted ? "true" : "false"}&autoplay=true`;
}

function buildChatUrl(channel: string): string {
  const parents = EMBED_PARENTS.map((p) => `parent=${encodeURIComponent(p)}`).join("&");
  return `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat?${parents}&darkpopout`;
}

export interface StreamEmbedProps {
  channelLogin: string;
  /** Display name (for the header + watch history). Falls back to login when omitted. */
  channelDisplayName?: string;
  /** Twitch numeric game id (for analytics aggregation). */
  twitchGameId?: string | null;
  twitchGameName?: string | null;
  /** Internal Nexus game id, when this embed is opened from a library context. */
  nexusGameId?: string | null;
  /** Hide the chat panel by default (useful in narrow containers). */
  defaultChatVisible?: boolean;
  /** Hide the close button (used by the pop-out window where Tauri owns the close). */
  hideClose?: boolean;
  /** Hide the pop-out button (used by the pop-out window itself). */
  hidePopOut?: boolean;
  /** Suppress watch history logging. The pop-out window passes `false` here so the
   *  inline embed can hand the session over without double counting. */
  trackWatchSession?: boolean;
  /**
   * When true, mark the header as a Tauri drag region so the user can drag the
   * containing (frameless) window by it. Buttons inside the header opt out via
   * `data-tauri-drag-region="false"` so clicks still work. Used by the pop-out
   * window where `decorations(false)` removes the OS title bar.
   */
  draggableHeader?: boolean;
  onClose?: () => void;
  /**
   * Called when the user requests a pop-out. The host should invoke
   * `popout_stream` (Tauri command) to spawn the always-on-top window.
   * StreamEmbed deliberately doesn't call the command directly so it can
   * be reused inside the pop-out window itself.
   */
  onPopOut?: () => void;
}

export function StreamEmbed({
  channelLogin,
  channelDisplayName,
  twitchGameId,
  twitchGameName,
  nexusGameId,
  defaultChatVisible = true,
  hideClose = false,
  hidePopOut = false,
  trackWatchSession = true,
  draggableHeader = false,
  onClose,
  onPopOut,
}: StreamEmbedProps) {
  const [chatVisible, setChatVisible] = React.useState(defaultChatVisible);
  const [muted, setMuted] = React.useState(true);
  const displayName = channelDisplayName ?? channelLogin;

  useWatchSession(trackWatchSession, {
    channelLogin,
    channelDisplayName,
    twitchGameId,
    twitchGameName,
    nexusGameId,
  });

  // Bump this counter to force the player + chat iframes to remount. We do that
  // after the in-app twitch.tv login window closes so the iframes pick up the
  // new session cookies without the user having to close-and-reopen the embed.
  const [reloadNonce, setReloadNonce] = React.useState(0);

  const playerUrl = React.useMemo(
    () => buildPlayerUrl(channelLogin, muted),
    [channelLogin, muted],
  );
  const chatUrl = React.useMemo(() => buildChatUrl(channelLogin), [channelLogin]);

  const openOnTwitch = () => {
    void openUrl(`https://twitch.tv/${channelLogin}`).catch(() => {});
  };

  // The Twitch player/chat iframes are served from twitch.tv, so they only know
  // who the viewer is via twitch.tv's own session cookies. Our app's Helix OAuth
  // token can't be passed in (Twitch doesn't expose that hook for embeds). The
  // workaround: open twitch.tv/login in a Tauri window that shares the WebView
  // cookie jar with this iframe — once the user signs in there, every embed in
  // the launcher is automatically logged in (chat, follow button, mature gate).
  const signInOnTwitch = () => {
    void invoke("open_twitch_login").catch(() => {});
  };

  // When the login window closes, reload the iframes so the freshly-set cookies
  // take effect immediately instead of only after the next embed mount.
  React.useEffect(() => {
    const unlistenPromise = listen("nexus://twitch-login-closed", () => {
      setReloadNonce((n) => n + 1);
    });
    return () => {
      void unlistenPromise.then((un) => un()).catch(() => {});
    };
  }, []);

  // Tauri reads `data-tauri-drag-region` as a boolean attribute. Setting it to
  // the empty string opts an element in; setting it to `"false"` opts a child
  // back out. We only enable it when explicitly requested so the inline embed
  // (rendered inside the main webview) keeps normal mouse selection behaviour.
  const dragOn = draggableHeader
    ? { "data-tauri-drag-region": "" as const }
    : {};
  const dragOff = draggableHeader
    ? { "data-tauri-drag-region": "false" as const }
    : {};

  return (
    <div
      data-testid="stream-embed"
      className="flex h-full w-full flex-col overflow-hidden rounded-md border border-border bg-card"
    >
      <header
        {...dragOn}
        className={`flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2 ${
          draggableHeader ? "cursor-grab select-none active:cursor-grabbing" : ""
        }`}
      >
        <div {...dragOn} className="flex min-w-0 items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full bg-red-500"
            aria-label="Live"
            {...dragOn}
          />
          <span className="truncate text-sm font-medium text-foreground" {...dragOn}>
            {displayName}
          </span>
          {twitchGameName && (
            <span
              className="truncate text-xs text-muted-foreground"
              {...dragOn}
            >
              · {twitchGameName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1" {...dragOff}>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-pressed={!muted}
            aria-label={muted ? "Unmute stream" : "Mute stream"}
            {...dragOff}
          >
            {muted ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            onClick={() => setChatVisible((v) => !v)}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-pressed={chatVisible}
            aria-label={chatVisible ? "Hide chat" : "Show chat"}
            {...dragOff}
          >
            {chatVisible ? (
              <MessageSquareOff className="size-4" />
            ) : (
              <MessageSquare className="size-4" />
            )}
          </button>
          <button
            type="button"
            onClick={signInOnTwitch}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Sign in on Twitch (so chat and follow work)"
            title="Sign in on Twitch"
            data-testid="stream-embed-signin"
            {...dragOff}
          >
            <LogIn className="size-4" />
          </button>
          <button
            type="button"
            onClick={openOnTwitch}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Open on twitch.tv"
            {...dragOff}
          >
            <ExternalLink className="size-4" />
          </button>
          {!hidePopOut && onPopOut && (
            <button
              type="button"
              onClick={onPopOut}
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Pop out player"
              data-testid="stream-embed-popout"
              {...dragOff}
            >
              <PictureInPicture2 className="size-4" />
            </button>
          )}
          {!hideClose && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close embedded player"
              data-testid="stream-embed-close"
              {...dragOff}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1 bg-black">
          <iframe
            key={`player-${reloadNonce}`}
            data-testid="stream-embed-player"
            title={`${displayName} live stream`}
            src={playerUrl}
            allow="autoplay; fullscreen"
            allowFullScreen
            className="absolute inset-0 size-full"
          />
        </div>
        {chatVisible && (
          <div className="hidden w-[340px] shrink-0 border-l border-border md:block">
            <iframe
              key={`chat-${reloadNonce}`}
              data-testid="stream-embed-chat"
              title={`${displayName} chat`}
              src={chatUrl}
              className="size-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}
