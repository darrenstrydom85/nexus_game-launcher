import * as React from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { Square, X } from "lucide-react";
import { cn, formatRunningTimer } from "@/lib/utils";

/** Events between the main window and the widget window (`useNowPlayingWidget`). */
export const WIDGET_EVENTS = {
  session: "now-playing-widget://session",
  ready: "now-playing-widget://ready",
  open: "now-playing-widget://open",
  stop: "now-playing-widget://stop",
  dismiss: "now-playing-widget://dismiss",
} as const;

export interface WidgetSession {
  gameName: string;
  coverUrl: string | null;
  startedAt: string;
  launching: boolean;
}

/**
 * Desktop card rendered in its own `now-playing` window while Nexus is
 * minimized. It holds no game state: the main window sends the session and
 * handles every click.
 */
export function NowPlayingWidget() {
  const [session, setSession] = React.useState<WidgetSession | null>(null);
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    const unlisten = listen<WidgetSession>(WIDGET_EVENTS.session, (e) => setSession(e.payload));
    // Ask only once listening, so the reply can't arrive first.
    unlisten.then(() => emit(WIDGET_EVENTS.ready));
    return () => {
      unlisten.then((off) => off());
    };
  }, []);

  const startedAt = session?.startedAt;
  React.useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Date.now() - start);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!session) return null;
  const { gameName, coverUrl, launching } = session;

  return (
    <div
      data-testid="now-playing-widget"
      className="relative flex h-screen select-none items-center gap-3 overflow-hidden p-3 pr-4"
    >
      {/* The whole card opens the game page; content lets clicks through, the buttons sit above. */}
      <button
        type="button"
        data-testid="now-playing-widget-open"
        aria-label={`Open ${gameName} in Nexus`}
        onClick={() => emit(WIDGET_EVENTS.open)}
        className="absolute inset-0 outline-none hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          draggable={false}
          className="img-outline pointer-events-none relative h-full w-12 shrink-0 rounded-md object-cover"
        />
      ) : null}
      <div className="pointer-events-none relative min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", launching ? "bg-warning" : "bg-success")} aria-hidden />
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-[0.08em]",
              launching ? "text-amber-700 dark:text-warning" : "text-green-700 dark:text-success",
            )}
          >
            {launching ? "Launching" : "Now playing"}
          </span>
        </div>
        <p className="truncate text-sm font-semibold text-foreground">{gameName}</p>
        <p className="font-mono text-[15px] tabular-nums text-muted-foreground">{formatRunningTimer(elapsed)}</p>
      </div>
      <button
        type="button"
        data-testid="now-playing-widget-stop"
        onClick={() => emit(WIDGET_EVENTS.stop)}
        className="pressable relative flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-destructive/15 px-3 text-[13px] font-semibold text-destructive outline-none hover:bg-destructive/25 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Square className="size-3 fill-current" strokeWidth={2} />
        Stop
      </button>
      <button
        type="button"
        data-testid="now-playing-widget-close"
        aria-label="Close"
        onClick={() => emit(WIDGET_EVENTS.dismiss)}
        className="absolute right-1 top-1 flex size-5 items-center justify-center rounded text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3" strokeWidth={2} />
      </button>
    </div>
  );
}
