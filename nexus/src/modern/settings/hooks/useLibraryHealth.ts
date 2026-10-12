import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { checkLibraryHealth, type DeadGame, type HealthCheckProgressEvent } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToastStore } from "@/stores/toastStore";
import { refreshGames } from "@/stores/gameStore";

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Runs a library health check on demand and keeps its results. The startup
 * check in App.tsx records the same `setHealthCheckResult` summary.
 */
export function useLibraryHealthCheck() {
  const setHealthCheckResult = useSettingsStore((s) => s.setHealthCheckResult);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<HealthCheckProgressEvent | null>(null);
  const [deadGames, setDeadGames] = React.useState<DeadGame[]>([]);
  const [totalChecked, setTotalChecked] = React.useState<number | null>(null);
  const [hasRun, setHasRun] = React.useState(false);

  const run = React.useCallback(async () => {
    setRunning(true);
    setProgress(null);
    let unlisten: (() => void) | undefined;
    try {
      unlisten = await listen<HealthCheckProgressEvent>("health-check-progress", (event) => {
        setProgress({ checked: event.payload.checked, total: event.payload.total });
      });
      const report = await checkLibraryHealth();
      setDeadGames(report.deadGames);
      setTotalChecked(report.totalChecked);
      setHealthCheckResult(report.checkedAt, report.deadGames.length);
      setHasRun(true);
    } catch {
      useToastStore.getState().addToast({ type: "error", message: "Couldn’t check your library. Please try again." });
    } finally {
      unlisten?.();
      setRunning(false);
      setProgress(null);
    }
  }, [setHealthCheckResult]);

  return { running, progress, deadGames, setDeadGames, totalChecked, hasRun, run };
}

/**
 * Fixes for games a health check could not find: point at the new exe, or
 * hide the game (undoable from a toast). Each fix updates the issue count.
 */
export function useDeadGameActions(deadGames: DeadGame[], onDeadGamesChange: (games: DeadGame[]) => void) {
  const addToast = useToastStore((s) => s.addToast);
  const setHealthCheckResult = useSettingsStore((s) => s.setHealthCheckResult);
  const lastHealthCheckAt = useSettingsStore((s) => s.lastHealthCheckAt);

  const settle = React.useCallback(
    (next: DeadGame[]) => {
      onDeadGamesChange(next);
      setHealthCheckResult(lastHealthCheckAt ?? new Date().toISOString(), next.length);
    },
    [onDeadGamesChange, setHealthCheckResult, lastHealthCheckAt],
  );

  const remove = React.useCallback(
    async (id: string) => {
      const game = deadGames.find((g) => g.id === id);
      if (!game) return;
      try {
        await invoke("update_game", { id, fields: { isHidden: true } });
      } catch {
        addToast({ type: "error", message: `Couldn’t remove "${game.name}". Please try again.` });
        return;
      }
      void refreshGames();
      const next = deadGames.filter((g) => g.id !== id);
      settle(next);
      addToast({
        type: "info",
        message: `"${game.name}" removed from library.`,
        duration: 5000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await invoke("update_game", { id, fields: { isHidden: false } });
              void refreshGames();
              settle([...next, game]);
            } catch {
              addToast({ type: "error", message: `Couldn’t bring back "${game.name}".` });
            }
          },
        },
      });
    },
    [deadGames, settle, addToast],
  );

  /** Opens a file picker in the game's folder. Resolves true when a new exe was saved. */
  const fixPath = React.useCallback(
    async (game: DeadGame) => {
      const selected = await openDialog({
        multiple: false,
        defaultPath: game.folderPath ?? undefined,
        filters: [{ name: "Executable", extensions: ["exe"] }],
      });
      if (!selected || typeof selected !== "string") return false;
      await invoke("update_game", { id: game.id, fields: { exePath: selected } });
      settle(deadGames.filter((g) => g.id !== game.id));
      addToast({ type: "success", message: "Executable path updated.", duration: 3000 });
      return true;
    },
    [deadGames, settle, addToast],
  );

  /** Hides every missing game. Ones that fail stay listed so they can be retried. */
  const removeAll = React.useCallback(async () => {
    const results = await Promise.allSettled(deadGames.map((g) => invoke("update_game", { id: g.id, fields: { isHidden: true } })));
    const failed = deadGames.filter((_, i) => results[i].status === "rejected");
    const removed = deadGames.length - failed.length;
    if (removed > 0) void refreshGames();
    settle(failed);
    if (failed.length === 0) {
      addToast({ type: "info", message: `${plural(removed, "game")} removed from library.`, duration: 5000 });
    } else {
      addToast({
        type: "error",
        message:
          removed > 0
            ? `Removed ${plural(removed, "game")}, but couldn’t remove ${failed.length}. Please try again.`
            : "Couldn’t remove the missing games. Please try again.",
      });
    }
  }, [deadGames, settle, addToast]);

  return { remove, fixPath, removeAll };
}
