import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SimilarGamesRow } from "@/components/GameDetail/SimilarGamesRow";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import type { SimilarGame } from "@/lib/tauri";

const similar: SimilarGame[] = [
  {
    igdbId: 2,
    name: "Owned Game",
    coverUrl: null,
    igdbUrl: "https://www.igdb.com/games/owned",
    stores: [{ store: "Steam", url: "https://store.steampowered.com/app/2" }],
  },
  {
    igdbId: 3,
    name: "New Game",
    coverUrl: null,
    igdbUrl: "https://www.igdb.com/games/new",
    stores: [
      { store: "Steam", url: "https://store.steampowered.com/app/3" },
      { store: "GOG", url: "https://www.gog.com/game/new" },
    ],
  },
  { igdbId: 4, name: "Console Only", coverUrl: null, igdbUrl: "https://www.igdb.com/games/c", stores: [] },
];

describe("SimilarGamesRow", () => {
  it("opens owned games in the library and others in their store", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) =>
      Promise.resolve(cmd === "get_similar_games" ? similar : {}),
    );
    useGameStore.setState({ games: [{ id: "lib-2", igdbId: 2 } as Game] });

    render(<SimilarGamesRow igdbId={1} />);

    // Owned: badge, no store links, cover opens the library entry.
    fireEvent.click(await screen.findByRole("button", { name: "Open Owned Game in your library" }));
    expect(useUiStore.getState().detailOverlayGameId).toBe("lib-2");
    expect(screen.queryByRole("button", { name: "Owned Game on Steam" })).toBeNull();

    // Not owned: cover opens the first store, each store has its own link.
    fireEvent.click(screen.getByRole("button", { name: "View New Game" }));
    expect(openUrl).toHaveBeenLastCalledWith("https://store.steampowered.com/app/3");
    fireEvent.click(screen.getByRole("button", { name: "New Game on GOG" }));
    expect(openUrl).toHaveBeenLastCalledWith("https://www.gog.com/game/new");

    // No store: falls back to the IGDB page.
    fireEvent.click(screen.getByRole("button", { name: "View Console Only" }));
    expect(openUrl).toHaveBeenLastCalledWith("https://www.igdb.com/games/c");
  });

  it("renders nothing without an IGDB match", () => {
    const { container } = render(<SimilarGamesRow igdbId={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
