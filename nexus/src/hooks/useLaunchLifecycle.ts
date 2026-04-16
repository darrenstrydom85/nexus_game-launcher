import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTauriEvent } from "./use-tauri-event";
import { useGameStore, type Game, type ActiveSession, refreshGames } from "@/stores/gameStore";
import { useToastStore } from "@/stores/toastStore";
import { dispatchLaunch, setRunningGame, type LaunchResult } from "@/lib/launcher";
import { useSessionNoteStore } from "@/stores/sessionNoteStore";
import { useStreakStore, checkMilestoneCrossed } from "@/stores/streakStore";
import { useMilestoneStore } from "@/stores/milestoneStore";
import { useMasteryStore } from "@/stores/masteryStore";
import { useAchievementStore } from "@/stores/achievementStore";
import { triggerMilestoneSound } from "@/components/Milestones/MilestoneToastStack";
import { useSettingsStore } from "@/stores/settingsStore";
import { useXpStore } from "@/stores/xpStore";
import { awardXp } from "@/lib/tauri";

const QUICK_EXIT_THRESHOLD_MS = 5000;
const PROCESS_POLL_INTERVAL_MS = 5000;
const INITIAL_POLL_DELAY_MS = 15000;
// Extended to accommodate launchers like Ubisoft Connect / Epic that can take
// several minutes to load before handing off to the actual game process.
const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes
const CONSECUTIVE_MISSES_TO_EXIT = 3;

export interface GameLaunchedEvent {
  sessionId: string;
  gameId: string;
  gameName: string;
  coverUrl: string | null;
  heroUrl: string | null;
  startedAt: string;
}

export interface GameExitedEvent {
  sessionId: string;
  gameId: string;
  durationS: number;
}

export function buildUpdatedExeNames(current: string | null, newExe: string): string {
  const existing = current
    ? current.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const isDuplicate = existing.some(
    (e) => e.toLowerCase() === newExe.toLowerCase(),
  );
  if (!isDuplicate) {
    existing.push(newExe);
  }
  return existing.join(", ");
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface FoundProcess {
  exeName: string;
  pid: number;
}

async function checkProcessAlive(session: ActiveSession): Promise<{ alive: boolean; found?: FoundProcess }> {
  // Strategy A: check by PID or known exe name directly
  if (session.pid || session.exeName) {
    try {
      const alive = await invoke<boolean>("check_process_running", {
        pid: session.pid ?? null,
        exeName: session.exeName ?? null,
      });
      if (alive) return { alive: true };
      // Fall through to Strategy C if we have candidates — the primary exe
      // may have exited but a child process from potentialExeNames may be running
    } catch {
      return { alive: false };
    }
  }

  // Strategy B: check any of the potential exe name candidates
  if (session.potentialExeNames && session.potentialExeNames.length > 0) {
    for (const exeName of session.potentialExeNames) {
      try {
        const alive = await invoke<boolean>("check_process_running", {
          pid: null,
          exeName,
        });
        if (alive) return { alive: true };
      } catch {
        // continue checking remaining candidates
      }
    }
    // All candidates checked and none found — process is gone
    if (!session.folderPath) return { alive: false };
  }

  // Strategy C: scan for a process running inside the game's install folder
  if (session.folderPath) {
    try {
      const found = await invoke<FoundProcess | null>("find_game_process", {
        folderPath: session.folderPath,
      });
      if (found) {
        return { alive: true, found };
      }
      return { alive: false };
    } catch {
      return { alive: false };
    }
  }

  // No way to check — assume still alive (user must stop manually)
  return { alive: true };
}

export function useLaunchLifecycle() {
  const setActiveSession = useGameStore((s) => s.setActiveSession);
  const setShowProcessPicker = useGameStore((s) => s.setShowProcessPicker);
  const activeSession = useGameStore((s) => s.activeSession);
  const addToast = useToastStore((s) => s.addToast);
  const launchTimeRef = React.useRef<number>(0);
  const promptShownRef = React.useRef(false);
  const pollingResumeRef = React.useRef<(() => void) | null>(null);

  const endSession = React.useCallback(
    async (session: ActiveSession) => {
      setActiveSession(null);
      setRunningGame(null);
      setShowProcessPicker(false);

      const startMs = new Date(session.startedAt).getTime();
      const durationS = Math.floor((Date.now() - startMs) / 1000);
      const elapsed = Date.now() - launchTimeRef.current;

      if (session.hasDbSession) {
        try {
          await invoke("end_session", {
            sessionId: session.sessionId,
            endedAt: new Date().toISOString(),
          });
        } catch {
          // best-effort
        }
      }

      await refreshGames();

      if (session.hasDbSession) {
        const prevStreak = useStreakStore.getState().streak?.currentStreak ?? 0;
        const snapshot = await useStreakStore.getState().refreshAfterSession();
        const newStreak = snapshot?.currentStreak ?? 0;
        const streakMilestone = checkMilestoneCrossed(prevStreak, newStreak);
        if (streakMilestone) {
          addToast({
            type: "success",
            message: `${streakMilestone}-Day Streak! You're on fire!`,
          });
        }

        await useMilestoneStore.getState().enqueueSessionMilestones(session.sessionId);
        const soundsOn = useSettingsStore.getState().milestoneSoundsEnabled;
        if (useMilestoneStore.getState().toastQueue.length > 0) {
          triggerMilestoneSound(soundsOn);
        }

        useMasteryStore.getState().refreshGame(session.gameId);

        useAchievementStore.getState().evaluate();

        useXpStore.getState().refreshXp().then(() => {
          const summary = useXpStore.getState().summary;
          if (summary?.leveledUp && summary.newLevel) {
            useXpStore.getState().showLevelUp(summary.newLevel, summary.totalXp);
          }
        });
      }

      if (elapsed >= QUICK_EXIT_THRESHOLD_MS) {
        addToast({
          type: "success",
          message: `Session ended — ${formatDuration(durationS)} played`,
        });

        if (session.hasDbSession) {
          useSessionNoteStore.getState().enqueue({
            sessionId: session.sessionId,
            gameName: session.gameName,
            durationS,
          });
        }
      }
    },
    [setActiveSession, setShowProcessPicker, addToast],
  );

  const handleGameLaunched = React.useCallback(
    (event: GameLaunchedEvent & { pid?: number; exeName?: string | null; folderPath?: string | null; potentialExeNames?: string | null; hasDbSession?: boolean }) => {
      launchTimeRef.current = Date.now();
      promptShownRef.current = false;
      pollingResumeRef.current = null;
      const potentialExeNames = event.potentialExeNames
        ? event.potentialExeNames.split(",").map((s) => s.trim()).filter(Boolean)
        : null;
      setActiveSession({
        sessionId: event.sessionId,
        gameId: event.gameId,
        gameName: event.gameName,
        coverUrl: event.coverUrl,
        heroUrl: event.heroUrl,
        startedAt: event.startedAt,
        dominantColor: "rgb(30, 30, 40)",
        pid: event.pid ?? null,
        exeName: event.exeName ?? null,
        folderPath: event.folderPath ?? null,
        potentialExeNames,
        processDetected: false,
        hasDbSession: event.hasDbSession ?? false,
      });
    },
    [setActiveSession],
  );

  const handleGameExited = React.useCallback(
    async (event: GameExitedEvent) => {
      const session = useGameStore.getState().activeSession;
      setActiveSession(null);
      setRunningGame(null);

      if (session?.hasDbSession) {
        try {
          await invoke("end_session", {
            sessionId: session.sessionId,
            endedAt: new Date().toISOString(),
          });
        } catch {
          // best-effort
        }
      }

      await refreshGames();

      if (session?.hasDbSession) {
        const prevStreak = useStreakStore.getState().streak?.currentStreak ?? 0;
        const snapshot = await useStreakStore.getState().refreshAfterSession();
        const newStreak = snapshot?.currentStreak ?? 0;
        const streakMilestone = checkMilestoneCrossed(prevStreak, newStreak);
        if (streakMilestone) {
          addToast({
            type: "success",
            message: `${streakMilestone}-Day Streak! You're on fire!`,
          });
        }

        await useMilestoneStore.getState().enqueueSessionMilestones(session.sessionId);
        const soundsOn = useSettingsStore.getState().milestoneSoundsEnabled;
        if (useMilestoneStore.getState().toastQueue.length > 0) {
          triggerMilestoneSound(soundsOn);
        }

        useMasteryStore.getState().refreshGame(session.gameId);

        useAchievementStore.getState().evaluate();

        useXpStore.getState().refreshXp().then(() => {
          const summary = useXpStore.getState().summary;
          if (summary?.leveledUp && summary.newLevel) {
            useXpStore.getState().showLevelUp(summary.newLevel, summary.totalXp);
          }
        });
      }

      const elapsed = Date.now() - launchTimeRef.current;
      if (elapsed >= QUICK_EXIT_THRESHOLD_MS) {
        addToast({
          type: "success",
          message: `Session ended — ${formatDuration(event.durationS)} played`,
        });

        if (session?.hasDbSession) {
          useSessionNoteStore.getState().enqueue({
            sessionId: session.sessionId,
            gameName: session.gameName,
            durationS: event.durationS,
          });
        }
      }
    },
    [setActiveSession, addToast],
  );

  const onProcessSelected = React.useCallback(
    async (exeName: string, _pid: number) => {
      const session = useGameStore.getState().activeSession;
      if (!session) return;

      setShowProcessPicker(false);

      const game = useGameStore.getState().games.find((g) => g.id === session.gameId);
      const currentExeNames = game?.potentialExeNames ?? null;
      const updatedPotentialExeNames = buildUpdatedExeNames(currentExeNames, exeName);

      const updateFields: Record<string, unknown> = {
        potentialExeNames: updatedPotentialExeNames,
      };
      if (!game?.exeName) {
        updateFields.exeName = exeName;
      }
      invoke("update_game", { id: session.gameId, fields: updateFields }).catch(() => {});

      const updatedList = updatedPotentialExeNames.split(",").map((s) => s.trim()).filter(Boolean);
      useGameStore.getState().setActiveSession({
        ...session,
        exeName: exeName,
        potentialExeNames: updatedList,
        processDetected: true,
      });

      await refreshGames();

      addToast({
        type: "success",
        message: `Now tracking ${session.gameName} via ${exeName}`,
      });

      pollingResumeRef.current?.();
    },
    [setShowProcessPicker, addToast],
  );

  const onCancelProcessPicker = React.useCallback(() => {
    setShowProcessPicker(false);
    const session = useGameStore.getState().activeSession;
    if (session) {
      endSession(session);
    }
  }, [setShowProcessPicker, endSession]);

  const onForceIdentifyCancel = React.useCallback(() => {
    setShowProcessPicker(false);
  }, [setShowProcessPicker]);

  const openForceIdentifyPicker = React.useCallback(() => {
    const session = useGameStore.getState().activeSession;
    if (!session || session.processDetected) return;
    setShowProcessPicker(true);
  }, [setShowProcessPicker]);

  useTauriEvent<GameLaunchedEvent>("game-launched", handleGameLaunched);
  useTauriEvent<GameExitedEvent>("game-exited", handleGameExited);

  React.useEffect(() => {
    if (!activeSession) return;

    const hasTrackingInfo = activeSession.pid || activeSession.exeName || activeSession.folderPath;
    if (!hasTrackingInfo) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let consecutiveMisses = 0;
    let processEverFound = false;
    let waitingForPicker = false;
    const launchTime = Date.now();

    const startPolling = () => {
      if (cancelled || intervalId) return;

      intervalId = setInterval(async () => {
        if (cancelled) return;

        const session = useGameStore.getState().activeSession;
        if (!session) {
          if (intervalId) clearInterval(intervalId);
          return;
        }

        const result = await checkProcessAlive(session);

        if (result.found && !session.exeName) {
          useGameStore.getState().setActiveSession({
            ...session,
            pid: result.found.pid,
            exeName: result.found.exeName,
          });
          invoke("update_game", {
            id: session.gameId,
            fields: { exeName: result.found.exeName },
          }).catch(() => {});
        }

        if (result.alive) {
          consecutiveMisses = 0;
          if (!processEverFound) {
            processEverFound = true;
            const current = useGameStore.getState().activeSession;
            if (current) {
              useGameStore.getState().setActiveSession({ ...current, processDetected: true });
            }
          }
          return;
        }

        consecutiveMisses++;

        const inGracePeriod = (Date.now() - launchTime) < GRACE_PERIOD_MS;
        if (inGracePeriod && !processEverFound) {
          return;
        }

        // Grace period expired, process never found — show picker once
        if (!processEverFound && !promptShownRef.current && !waitingForPicker) {
          promptShownRef.current = true;
          waitingForPicker = true;
          if (intervalId) { clearInterval(intervalId); intervalId = null; }

          pollingResumeRef.current = () => {
            waitingForPicker = false;
            consecutiveMisses = 0;
            processEverFound = true;
            if (!cancelled) startPolling();
          };

          useGameStore.getState().setShowProcessPicker(true);
          return;
        }

        if (consecutiveMisses >= CONSECUTIVE_MISSES_TO_EXIT && !cancelled) {
          if (intervalId) clearInterval(intervalId);
          endSession(session);
        }
      }, PROCESS_POLL_INTERVAL_MS);
    };

    const delayTimer = setTimeout(() => {
      if (cancelled) return;
      startPolling();
    }, INITIAL_POLL_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(delayTimer);
      if (intervalId) clearInterval(intervalId);
      pollingResumeRef.current = null;
    };
  }, [activeSession?.sessionId, endSession]);

  const launch = React.useCallback(
    async (game: Game): Promise<LaunchResult> => {
      const session = useGameStore.getState().activeSession;
      if (session) {
        if (session.pid) {
          invoke("stop_game", { pid: session.pid }).catch(() => {});
        }
        setActiveSession(null);
        setRunningGame(null);
        if (session.hasDbSession) {
          try {
            await invoke("end_session", {
              sessionId: session.sessionId,
              endedAt: new Date().toISOString(),
            });
          } catch {
            // best-effort
          }
        }
        await refreshGames();
      }

      const result = await dispatchLaunch(game);

      if (result.status === "launched") {
        let dbSessionId: string | null = null;
        try {
          const dbSession = await invoke<{ id: string; startedAt: string }>(
            "create_session",
            { gameId: game.id },
          );
          dbSessionId = dbSession.id;
        } catch (err) {
          console.error("[useLaunchLifecycle] create_session failed:", err);
        }

        handleGameLaunched({
          sessionId: dbSessionId ?? result.sessionId,
          gameId: game.id,
          gameName: game.name,
          coverUrl: game.coverUrl,
          heroUrl: game.heroUrl,
          startedAt: new Date().toISOString(),
          pid: result.pid,
          exeName: game.exeName,
          folderPath: game.folderPath,
          potentialExeNames: game.potentialExeNames ?? null,
          hasDbSession: dbSessionId !== null,
        });

        const today = new Date().toISOString().slice(0, 10);
        awardXp("game_launch", `${game.id}_${today}`, 5, `Launched ${game.name} (+5 XP)`)
          .then((summary) => {
            useXpStore.getState().refreshXp();
            if (summary.leveledUp && summary.newLevel) {
              useXpStore.getState().showLevelUp(summary.newLevel, summary.totalXp);
            }
          })
          .catch(() => {});
      }

      return result;
    },
    [handleGameLaunched, setActiveSession],
  );

  return { launch, onProcessSelected, onCancelProcessPicker, onForceIdentifyCancel, openForceIdentifyPicker };
}

export { QUICK_EXIT_THRESHOLD_MS, GRACE_PERIOD_MS };
