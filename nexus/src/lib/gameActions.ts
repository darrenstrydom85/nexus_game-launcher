import { invoke } from "@tauri-apps/api/core";
import { refreshGames, type Game, type GameStatus } from "@/stores/gameStore";
import { useQueueStore } from "@/stores/queueStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useCeremonyStore } from "@/stores/ceremonyStore";
import { useCollectionStore } from "@/stores/collectionStore";
import { useUiStore } from "@/stores/uiStore";

/*
 * Game mutations shared by every shell (classic sidebar, v1 top bar, retro).
 * Each one writes through Tauri, then refreshes the stores that mirror it.
 */

function retire(gameId: string) {
  const qs = useQueueStore.getState();
  if (qs.isQueued(gameId)) {
    const entry = qs.entries.find((e) => e.gameId === gameId);
    qs.remove(gameId, entry?.name);
  }
  // Epic 41: retirement ceremony when a game is completed or dropped.
  if (useSettingsStore.getState().retirementCeremonyEnabled) {
    useCeremonyStore.getState().openForGame(gameId, "retirement").catch(() => {});
  }
}

export async function setGameStatus(gameId: string, status: GameStatus): Promise<void> {
  try {
    await invoke("update_game", { id: gameId, fields: { status } });
    await refreshGames();
    if (status === "completed" || status === "dropped") retire(gameId);
  } catch {
    // best-effort, like the rest of the library actions
  }
}

/**
 * Marks a game completed or not. Archived games (status "removed") only flip
 * the flag; for installed games the status carries it, so unmarking a
 * "completed" game no longer leaves status and flag disagreeing.
 */
export async function setGameCompleted(game: Game, completed: boolean): Promise<void> {
  if (game.status !== "removed") {
    if (completed) return setGameStatus(game.id, "completed");
    if (game.status === "completed") return setGameStatus(game.id, "unset");
  }
  try {
    await invoke("update_game", { id: game.id, fields: { completed } });
    await refreshGames();
    if (completed && !game.completed && useSettingsStore.getState().retirementCeremonyEnabled) {
      useCeremonyStore.getState().openForGame(game.id, "retirement").catch(() => {});
    }
  } catch {
    // best-effort
  }
}

export async function setGameRating(gameId: string, rating: number | null): Promise<void> {
  try {
    await invoke("update_game", { id: gameId, fields: { rating } });
    await refreshGames();
  } catch {
    // best-effort
  }
}

export async function hideGame(game: Game): Promise<void> {
  try {
    await invoke("update_game", { id: game.id, fields: { isHidden: true } });
    useSettingsStore.getState().hideGame(game.id);
    const ui = useUiStore.getState();
    if (ui.detailOverlayGameId === game.id) ui.setDetailOverlayGameId(null);
  } catch {
    // best-effort
  }
}

export async function unhideGame(game: Game): Promise<void> {
  try {
    await invoke("update_game", { id: game.id, fields: { isHidden: false } });
    useSettingsStore.getState().unhideGame(game.id);
  } catch {
    // best-effort
  }
}

export function openGameFolder(game: Game): void {
  if (game.folderPath) invoke("open_game_folder", { id: game.id }).catch(() => {});
}

export async function refetchGameMetadata(game: Game): Promise<void> {
  await invoke("fetch_metadata", { gameId: game.id });
  await refreshGames();
}

export async function addGameToCollection(gameId: string, collectionId: string): Promise<void> {
  try {
    await invoke("add_to_collection", { collectionId, gameId });
    useCollectionStore.getState().addGameToCollection(collectionId, gameId);
  } catch {
    // best-effort
  }
}

export async function removeGameFromCollection(gameId: string, collectionId: string): Promise<void> {
  try {
    await invoke("remove_from_collection", { collectionId, gameId });
    useCollectionStore.getState().removeGameFromCollection(collectionId, gameId);
  } catch {
    // best-effort
  }
}
