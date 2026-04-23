import * as React from "react";
import {
  twitchWatchSessionStart,
  twitchWatchSessionEnd,
  type TwitchWatchSessionStartArgs,
} from "@/lib/tauri";

/**
 * Visibility-aware watch session timer (Story E1).
 *
 * Lifecycle when `enabled` flips to true:
 *   1. Backend session row is inserted via `twitch_watch_session_start`.
 *   2. While the document is visible, an interval ticks effective seconds.
 *   3. When the document becomes hidden (alt-tab, minimized window), the timer
 *      pauses; resuming visibility starts ticking again.
 *   4. On unmount or when `enabled` flips to false, `twitch_watch_session_end`
 *      is called with the accumulated seconds. The backend clamps to a 24h
 *      ceiling, so a stuck timer can't poison the totals.
 *
 * The hook is intentionally fire-and-forget on errors (network blip, manager
 * not registered): missing a session is preferable to crashing the embed.
 */
export function useWatchSession(
  enabled: boolean,
  args: TwitchWatchSessionStartArgs,
): void {
  // Args are captured in a ref so changes (e.g. game id resolving asynchronously)
  // don't restart the session.
  const argsRef = React.useRef(args);
  argsRef.current = args;

  React.useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let sessionId: number | null = null;
    let accumulatedSecs = 0;
    let visibleSince: number | null =
      typeof document !== "undefined" && !document.hidden ? Date.now() : null;
    let tickHandle: ReturnType<typeof setInterval> | null = null;

    const accumulateNow = () => {
      if (visibleSince != null) {
        accumulatedSecs += Math.max(
          0,
          Math.floor((Date.now() - visibleSince) / 1000),
        );
        visibleSince = Date.now();
      }
    };

    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.hidden) {
        accumulateNow();
        visibleSince = null;
      } else if (visibleSince == null) {
        visibleSince = Date.now();
      }
    };

    const startTicking = () => {
      if (tickHandle != null) return;
      tickHandle = setInterval(accumulateNow, 5000);
    };

    void (async () => {
      try {
        const id = await twitchWatchSessionStart(argsRef.current);
        if (cancelled) {
          // Component unmounted before the backend acknowledged. End it
          // immediately so we don't leave an open row.
          try {
            await twitchWatchSessionEnd(id, accumulatedSecs);
          } catch {
            // best-effort
          }
          return;
        }
        sessionId = id;
        startTicking();
      } catch {
        // Swallow: the embed is more important than the metric.
      }
    })();

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (tickHandle != null) clearInterval(tickHandle);
      accumulateNow();
      const finalSecs = accumulatedSecs;
      const id = sessionId;
      if (id != null) {
        void twitchWatchSessionEnd(id, finalSecs).catch(() => {});
      }
    };
    // We intentionally don't depend on `args`: those are read via the ref so a
    // late-arriving game name doesn't restart the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
