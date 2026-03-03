import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HiddenGamesList } from "@/components/Settings/HiddenGamesList";
import { useSettingsStore } from "@/stores/settingsStore";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useToastStore } from "@/stores/toastStore";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));

const makeGame = (id: string, name: string, coverUrl: string | null = null): Game => ({
  id,
  name,
  source: "steam",
  folderPath: null,
  exePath: null,
  exeName: null,
  launchUrl: null,
  igdbId: null,
  steamgridId: null,
  description: null,
  coverUrl,
  heroUrl: null,
  logoUrl: null,
  iconUrl: null,
  customCover: null,
  customHero: null,
  potentialExeNames: null,
  genres: [],
  releaseDate: null,
  criticScore: null,
  criticScoreCount: null,
  communityScore: null,
  communityScoreCount: null,
  trailerUrl: null,
  status: "unset",
  rating: null,
  totalPlayTimeS: 0,
  lastPlayedAt: null,
  playCount: 0,
  addedAt: "2026-01-01",
  isHidden: false,
});

describe("Story 12.8: HiddenGamesList", () => {
  beforeEach(() => {
    mockInvoke.mockResolvedValue(undefined);
    useSettingsStore.setState({ hiddenGameIds: [] });
    useGameStore.setState({
      games: [
        makeGame("g1", "Zelda"),
        makeGame("g2", "Elden Ring"),
        makeGame("g3", "Cyberpunk"),
        makeGame("g4", "Hades"),
        makeGame("g5", "Stardew Valley"),
      ],
      isLoading: false,
      error: null,
    });
    useToastStore.setState({ toasts: [] });
  });

  it("renders nothing when no games are hidden", () => {
    render(<HiddenGamesList />);
    expect(screen.queryByTestId("hidden-games-section")).not.toBeInTheDocument();
  });

  it("renders the section when games are hidden", () => {
    useSettingsStore.setState({ hiddenGameIds: ["g1", "g2", "g3"] });
    render(<HiddenGamesList />);
    expect(screen.getByTestId("hidden-games-section")).toBeInTheDocument();
  });

  it("shows correct hidden game count in header", () => {
    useSettingsStore.setState({ hiddenGameIds: ["g1", "g2"] });
    render(<HiddenGamesList />);
    expect(screen.getByTestId("hidden-games-section")).toHaveTextContent("2 hidden games");
  });

  it("uses singular 'game' when only one is hidden", () => {
    useSettingsStore.setState({ hiddenGameIds: ["g1"] });
    render(<HiddenGamesList />);
    expect(screen.getByTestId("hidden-games-section")).toHaveTextContent("1 hidden game");
    expect(screen.getByTestId("hidden-games-section")).not.toHaveTextContent("1 hidden games");
  });

  it("renders a row for each hidden game", () => {
    useSettingsStore.setState({ hiddenGameIds: ["g1", "g2", "g3"] });
    render(<HiddenGamesList />);
    expect(screen.getByTestId("hidden-game-row-g1")).toBeInTheDocument();
    expect(screen.getByTestId("hidden-game-row-g2")).toBeInTheDocument();
    expect(screen.getByTestId("hidden-game-row-g3")).toBeInTheDocument();
  });

  it("displays game names in the list", () => {
    useSettingsStore.setState({ hiddenGameIds: ["g2", "g3"] });
    render(<HiddenGamesList />);
    expect(screen.getByText("Elden Ring")).toBeInTheDocument();
    expect(screen.getByText("Cyberpunk")).toBeInTheDocument();
  });

  it("sorts hidden games alphabetically by name", () => {
    useSettingsStore.setState({ hiddenGameIds: ["g1", "g2", "g3"] });
    render(<HiddenGamesList />);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Cyberpunk");
    expect(rows[1]).toHaveTextContent("Elden Ring");
    expect(rows[2]).toHaveTextContent("Zelda");
  });

  it("shows 'Unknown Game' for a hidden id not in gameStore", () => {
    useSettingsStore.setState({ hiddenGameIds: ["ghost-id"] });
    render(<HiddenGamesList />);
    expect(screen.getByText("Unknown Game")).toBeInTheDocument();
  });

  it("individual Unhide button removes only that game from hiddenGameIds", async () => {
    useSettingsStore.setState({ hiddenGameIds: ["g1", "g2", "g3"] });
    render(<HiddenGamesList />);
    fireEvent.click(screen.getByTestId("unhide-btn-g2"));
    await waitFor(() => {
      const ids = useSettingsStore.getState().hiddenGameIds;
      expect(ids).not.toContain("g2");
      expect(ids).toContain("g1");
      expect(ids).toContain("g3");
    });
  });

  it("individual Unhide fires a success toast with the game name", async () => {
    useSettingsStore.setState({ hiddenGameIds: ["g3"] });
    render(<HiddenGamesList />);
    fireEvent.click(screen.getByTestId("unhide-btn-g3"));
    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].type).toBe("success");
      expect(toasts[0].message).toContain("Cyberpunk");
      expect(toasts[0].message).toContain("restored to library");
    });
  });

  it("Unhide all button clears all hidden games", async () => {
    useSettingsStore.setState({ hiddenGameIds: ["g1", "g2", "g3"] });
    render(<HiddenGamesList />);
    fireEvent.click(screen.getByTestId("unhide-all"));
    await waitFor(() => {
      expect(useSettingsStore.getState().hiddenGameIds).toHaveLength(0);
    });
  });

  it("Unhide all fires a single toast", async () => {
    useSettingsStore.setState({ hiddenGameIds: ["g1", "g2"] });
    render(<HiddenGamesList />);
    fireEvent.click(screen.getByTestId("unhide-all"));
    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].type).toBe("success");
      expect(toasts[0].message).toBe("All hidden games restored");
    });
  });

  it("section disappears after all games are unhidden via individual buttons", async () => {
    useSettingsStore.setState({ hiddenGameIds: ["g1"] });
    render(<HiddenGamesList />);
    expect(screen.getByTestId("hidden-games-section")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("unhide-btn-g1"));
    await waitFor(() => {
      expect(screen.queryByTestId("hidden-games-section")).not.toBeInTheDocument();
    });
  });

  it("renders cover image when coverUrl is present", () => {
    useGameStore.setState({
      games: [makeGame("g1", "Zelda", "https://example.com/cover.jpg")],
      isLoading: false,
      error: null,
    });
    useSettingsStore.setState({ hiddenGameIds: ["g1"] });
    render(<HiddenGamesList />);
    const img = screen.getByRole("img", { name: "Zelda" });
    expect(img).toHaveAttribute("src", "https://example.com/cover.jpg");
  });

  it("renders fallback icon when coverUrl is null", () => {
    useSettingsStore.setState({ hiddenGameIds: ["g1"] });
    render(<HiddenGamesList />);
    expect(screen.queryByRole("img", { name: "Zelda" })).not.toBeInTheDocument();
  });
});
