import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "motion/react";
import { useTwitchStore, type PendingToastItem } from "@/stores/twitchStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { TwitchToast } from "./TwitchToast";

const AUTO_DISMISS_MS = 5000;
const MAX_VISIBLE = 3;
const ENTER_DURATION_MS = 300;
const EXIT_DURATION_MS = 200;
const REDUCED_MOTION_MS = 150;

function useReducedMotion(): boolean {
  const settingReduced = useSettingsStore((s) => s.reducedMotion);
  const [prefersReduced, setPrefersReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(mq.matches);
    const handler = () => setPrefersReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return settingReduced || prefersReduced;
}

export function TwitchToastContainer() {
  const pendingToasts = useTwitchStore((s) => s.pendingToasts);
  const removePendingToast = useTwitchStore((s) => s.removePendingToast);
  const twitchEnabled = useSettingsStore((s) => s.twitchEnabled);
  const twitchNotificationsEnabled = useSettingsStore((s) => s.twitchNotificationsEnabled);
  const twitchNotificationsFavoritesOnly = useSettingsStore((s) => s.twitchNotificationsFavoritesOnly);
  const reducedMotion = useReducedMotion();

  const startedAtRef = React.useRef<Record<string, number>>({});
  const timeoutRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pauseStartedRef = React.useRef<Record<string, number>>({});

  const filtered = React.useMemo(() => {
    if (!twitchEnabled || !twitchNotificationsEnabled) return [];
    let list = pendingToasts;
    if (twitchNotificationsFavoritesOnly) {
      list = list.filter((t) => t.isFavorite);
    }
    return list.slice(0, MAX_VISIBLE);
  }, [pendingToasts, twitchEnabled, twitchNotificationsEnabled, twitchNotificationsFavoritesOnly]);

  const startTimer = React.useCallback(
    (id: string) => {
      const now = Date.now();
      const pauseStarted = pauseStartedRef.current[id];
      const startedAt = startedAtRef.current[id] ?? now;
      const elapsed = pauseStarted != null ? pauseStarted - startedAt : now - startedAt;
      const remaining = Math.max(0, AUTO_DISMISS_MS - elapsed);
      if (pauseStarted != null) {
        delete pauseStartedRef.current[id];
      }
      startedAtRef.current[id] = startedAt;
      timeoutRef.current[id] = setTimeout(() => {
        removePendingToast(id);
        delete timeoutRef.current[id];
        delete startedAtRef.current[id];
        delete pauseStartedRef.current[id];
      }, remaining);
    },
    [removePendingToast],
  );

  const pauseTimer = React.useCallback((id: string) => {
    if (timeoutRef.current[id]) {
      clearTimeout(timeoutRef.current[id]);
      delete timeoutRef.current[id];
    }
    pauseStartedRef.current[id] = Date.now();
  }, []);

  const resumeTimer = React.useCallback(
    (id: string) => {
      startTimer(id);
    },
    [startTimer],
  );

  const filteredIds = filtered.map((t) => t.id).join(",");
  React.useEffect(() => {
    filtered.forEach((t) => {
      if (!timeoutRef.current[t.id] && !pauseStartedRef.current[t.id]) {
        startedAtRef.current[t.id] = Date.now();
        startTimer(t.id);
      }
    });
    const ids = new Set(filtered.map((t) => t.id));
    return () => {
      Object.keys(timeoutRef.current).forEach((id) => {
        if (!ids.has(id)) {
          clearTimeout(timeoutRef.current[id]);
          delete timeoutRef.current[id];
          delete startedAtRef.current[id];
          delete pauseStartedRef.current[id];
        }
      });
    };
  }, [filteredIds, startTimer]);

  const handleOpenChannel = React.useCallback((toast: PendingToastItem) => {
    void invoke("popout_stream", {
      channelLogin: toast.login,
      channelDisplayName: toast.displayName,
      twitchGameId: null,
      twitchGameName: toast.gameName || null,
    }).catch((e) => {
      console.error("[twitch] popout_stream failed from toast:", e);
    });
  }, []);

  const enterTransition = reducedMotion
    ? { duration: REDUCED_MOTION_MS / 1000, opacity: { duration: REDUCED_MOTION_MS / 1000 } }
    : {
        duration: ENTER_DURATION_MS / 1000,
        ease: [0.4, 0, 0.2, 1] as const,
      };
  const exitTransition = reducedMotion
    ? { duration: REDUCED_MOTION_MS / 1000, opacity: { duration: REDUCED_MOTION_MS / 1000 } }
    : {
        duration: EXIT_DURATION_MS / 1000,
        ease: [0.4, 0, 0.2, 1] as const,
      };

  const initial = reducedMotion ? { opacity: 0 } : { opacity: 0, x: 24 };
  const animate = reducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 };
  const exitAnim = reducedMotion ? { opacity: 0 } : { opacity: 0, x: 24 };
  const exit = { ...exitAnim, transition: exitTransition };

  if (filtered.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-40 flex flex-col gap-2"
      style={{ bottom: 16, right: 16 }}
    >
      <AnimatePresence initial={false}>
        {filtered.map((toast) => (
          <motion.div
            key={toast.id}
            initial={initial}
            animate={animate}
            exit={exit}
            transition={enterTransition}
            onMouseEnter={() => pauseTimer(toast.id)}
            onMouseLeave={() => resumeTimer(toast.id)}
          >
            <TwitchToast
              toast={toast}
              onDismiss={removePendingToast}
              onOpenChannel={handleOpenChannel}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
