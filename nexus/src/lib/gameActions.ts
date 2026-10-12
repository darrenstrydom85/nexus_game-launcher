import { invoke } from "@tauri-apps/api/core";
import { refreshGames, type Game, type GameStatus } from "@/stores/gameStore";
import { useQueueStore } from "@/stores/queueStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useCeremonyStore } from "@/stores/ceremonyStore";
import { useCollectionStore } from "@/stores/collectionStore";
import { useUiStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";

/*
 * Game mutations shared by every shell (classic sidebar, v1 top bar, retro).
 * Each one writes through Tauri, then refreshes the stores that mirror it.
 * A failed write says so in a toast and resolves false, so the UI never
 * pretends a change stuck when it didn't.
 */

function failed(message: string): false {
  useToastStore.getState().addToast({ type: "error", message });
  return false;
}

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

export async function setGameStatus(gameId: string, status: GameStatus): Promise<boolean> {
  try {
    await invoke("update_game", { id: gameId, fields: { status } });
  } catch {
    return failed("Couldn't change the game's status.");
  }
  await refreshGames();
  if (status === "completed" || status === "dropped") retire(gameId);
  return true;
}

/**
 * Marks a game completed or not. Archived games (status "removed") only flip
 * the flag; for installed games the status carries it, so unmarking a
 * "completed" game no longer leaves status and flag disagreeing.
 */
export async function setGameCompleted(game: Game, completed: boolean): Promise<boolean> {
  if (game.status !== "removed") {
    if (completed) return setGameStatus(game.id, "completed");
    if (game.status === "completed") return setGameStatus(game.id, "unset");
  }
  try {
    await invoke("update_game", { id: game.id, fields: { completed } });
  } catch {
    return failed("Couldn't update the game.");
  }
  await refreshGames();
  if (completed && !game.completed && useSettingsStore.getState().retirementCeremonyEnabled) {
    useCeremonyStore.getState().openForGame(game.id, "retirement").catch(() => {});
  }
  return true;
}

export async function setGameRating(gameId: string, rating: number | null): Promise<boolean> {
  try {
    await invoke("update_game", { id: gameId, fields: { rating } });
  } catch {
    return failed("Couldn't save the rating.");
  }
  await refreshGames();
  return true;
}

export async function hideGame(game: Game): Promise<boolean> {
  try {
    await invoke("update_game", { id: game.id, fields: { isHidden: true } });
  } catch {
    return failed(`Couldn't hide ${game.name}.`);
  }
  useSettingsStore.getState().hideGame(game.id);
  const ui = useUiStore.getState();
  if (ui.detailOverlayGameId === game.id) ui.setDetailOverlayGameId(null);
  return true;
}

export async function unhideGame(game: Game): Promise<boolean> {
  try {
    await invoke("update_game", { id: game.id, fields: { isHidden: false } });
  } catch {
    return failed(`Couldn't unhide ${game.name}.`);
  }
  useSettingsStore.getState().unhideGame(game.id);
  return true;
}

export function openGameFolder(game: Game): void {
  if (game.folderPath) invoke("open_game_folder", { id: game.id }).catch(() => failed("Couldn't open the install folder."));
}

export async function refetchGameMetadata(game: Game): Promise<boolean> {
  try {
    await invoke("fetch_metadata", { gameId: game.id });
  } catch {
    return failed(`Couldn't re-fetch metadata for ${game.name}.`);
  }
  await refreshGames();
  return true;
}

export async function addGameToCollection(gameId: string, collectionId: string): Promise<boolean> {
  try {
    await invoke("add_to_collection", { collectionId, gameId });
  } catch {
    return failed("Couldn't add the game to that collection.");
  }
  useCollectionStore.getState().addGameToCollection(collectionId, gameId);
  return true;
}

export async function removeGameFromCollection(gameId: string, collectionId: string): Promise<boolean> {
  try {
    await invoke("remove_from_collection", { collectionId, gameId });
  } catch {
    return failed("Couldn't remove the game from that collection.");
  }
  useCollectionStore.getState().removeGameFromCollection(collectionId, gameId);
  return true;
}
