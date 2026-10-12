import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "@/stores/settingsStore";
import { useGameStore } from "@/stores/gameStore";
import { useToastStore } from "@/stores/toastStore";

export interface HiddenGame {
  id: string;
  name: string;
  coverUrl: string | null;
}

/** Hidden games sorted by name, with unhide actions that report through toasts. */
export function useHiddenGames() {
  const hiddenGameIds = useSettingsStore((s) => s.hiddenGameIds);
  const unhideGame = useSettingsStore((s) => s.unhideGame);
  const games = useGameStore((s) => s.games);
  const addToast = useToastStore((s) => s.addToast);

  const hiddenGames = React.useMemo<HiddenGame[]>(
    () =>
      hiddenGameIds
        .map((id) => {
          const game = games.find((g) => g.id === id);
          return { id, name: game?.name ?? "Unknown Game", coverUrl: game?.coverUrl ?? null };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [hiddenGameIds, games],
  );

  const unhide = React.useCallback(
    (id: string, name: string) =>
      invoke("update_game", { id, fields: { isHidden: false } })
        .then(() => {
          unhideGame(id);
          addToast({ type: "success", message: `"${name}" restored to library` });
        })
        .catch(() => addToast({ type: "error", message: "Failed to restore game" })),
    [unhideGame, addToast],
  );

  const unhideAll = React.useCallback(
    () =>
      Promise.all(hiddenGameIds.map((id) => invoke("update_game", { id, fields: { isHidden: false } })))
        .then(() => {
          hiddenGameIds.forEach((id) => unhideGame(id));
          addToast({ type: "success", message: "All hidden games restored" });
        })
        .catch(() => addToast({ type: "error", message: "Failed to restore some games" })),
    [hiddenGameIds, unhideGame, addToast],
  );

  return { hiddenGames, unhide, unhideAll };
}
