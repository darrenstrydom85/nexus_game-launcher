import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGameStore, type Game } from "@/stores/gameStore";

export function useGames() {
  const games = useGameStore((s) => s.games);
  const isLoading = useGameStore((s) => s.isLoading);
  const error = useGameStore((s) => s.error);
  const setGames = useGameStore((s) => s.setGames);
  const setLoading = useGameStore((s) => s.setLoading);
  const setError = useGameStore((s) => s.setError);

  React.useEffect(() => {
    if (games.length > 0 || error) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<Game[]>("get_games", { params: {} })
      .then((data) => {
        if (!cancelled) {
          setGames(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? "Failed to load games");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [games.length, error, setGames, setLoading, setError]);

  return { games, isLoading, error };
}
