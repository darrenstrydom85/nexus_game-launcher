import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGameStore, type ActiveSession } from "@/stores/gameStore";
import { useToastStore } from "@/stores/toastStore";
import { setRunningGame } from "@/lib/launcher";

export interface OrphanedSession {
  sessionId: string;
  gameId: string;
  gameName: string;
  coverUrl: string | null;
  heroUrl: string | null;
  startedAt: string;
  exeName: string | null;
}

export interface RecoveryResult {
  recovered: number;
  closed: number;
  resumed: number;
}

export function estimateEndTime(_startedAt: string): string {
  return new Date().toISOString();
}

export async function fetchOrphanedSessions(): Promise<OrphanedSession[]> {
  return invoke<OrphanedSession[]>("get_orphaned_sessions");
}

export async function closeOrphanedSession(sessionId: string): Promise<void> {
  await invoke("end_session", { sessionId, endedAt: new Date().toISOString() });
}

export async function checkProcessRunning(exeName: string): Promise<boolean> {
  try {
    return await invoke<boolean>("check_process_running", { exeName });
  } catch {
    return false;
  }
}

export async function recoverOrphanedSessions(): Promise<RecoveryResult> {
  const orphans = await fetchOrphanedSessions();
  const result: RecoveryResult = { recovered: orphans.length, closed: 0, resumed: 0 };

  for (const session of orphans) {
    const isRunning = session.exeName
      ? await checkProcessRunning(session.exeName)
      : false;

    if (isRunning) {
      result.resumed++;
    } else {
      await closeOrphanedSession(session.sessionId);
      result.closed++;
    }
  }

  return result;
}

export function useOrphanedSessionRecovery() {
  const setActiveSession = useGameStore((s) => s.setActiveSession);
  const addToast = useToastStore((s) => s.addToast);
  const [recoveryDone, setRecoveryDone] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function recover() {
      try {
        const orphans = await fetchOrphanedSessions();
        if (cancelled || orphans.length === 0) {
          setRecoveryDone(true);
          return;
        }

        for (const session of orphans) {
          if (cancelled) break;

          const isRunning = session.exeName
            ? await checkProcessRunning(session.exeName)
            : false;

          if (isRunning) {
            setActiveSession({
              sessionId: session.sessionId,
              gameId: session.gameId,
              gameName: session.gameName,
              coverUrl: session.coverUrl,
              heroUrl: session.heroUrl,
              startedAt: session.startedAt,
              dominantColor: "rgb(30, 30, 40)",
              pid: null,
              exeName: session.exeName,
              folderPath: null,
              potentialExeNames: null,
              processDetected: false,
              hasDbSession: true,
            });
            setRunningGame(session.gameId);
            addToast({
              type: "info",
              message: `Resumed tracking "${session.gameName}"`,
            });
          } else {
            await closeOrphanedSession(session.sessionId);
            addToast({
              type: "info",
              message: `Closed orphaned session for "${session.gameName}"`,
            });
          }
        }
      } catch {
        // Recovery is best-effort
      } finally {
        if (!cancelled) setRecoveryDone(true);
      }
    }

    recover();
    return () => { cancelled = true; };
  }, [setActiveSession, addToast]);

  return { recoveryDone };
}

export interface ConcurrentLaunchCheck {
  isRunning: boolean;
  runningGameName: string | null;
}

export function checkConcurrentLaunch(
  activeSession: ActiveSession | null,
): ConcurrentLaunchCheck {
  if (!activeSession) {
    return { isRunning: false, runningGameName: null };
  }
  return { isRunning: true, runningGameName: activeSession.gameName };
}
